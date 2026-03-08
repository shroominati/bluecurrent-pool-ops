#!/usr/bin/env python3
"""Resume pending clawbot tasks, inspect state, and run local compatibility checks.

This script is designed to be dropped into a repo and pointed at ~/.clawbot state.
It safely handles missing DB files/tables and missing thebot imports with clear errors.
"""

from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import json
import logging
import shlex
import shutil
import socket
import sqlite3
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

try:
    from thebot.agent.do_loop import _coerce_run_argv, maybe_resume_pending_do
except Exception:  # pragma: no cover - depends on runtime package availability
    _coerce_run_argv = None
    maybe_resume_pending_do = None


DEFAULT_STATE = Path.home() / ".clawbot"


@dataclass(frozen=True)
class Paths:
    state: Path
    jobs_db: Path
    logs_dir: Path
    coord_db: Path

    @classmethod
    def from_state(cls, state: Path) -> "Paths":
        return cls(
            state=state,
            jobs_db=state / "jobs.db",
            logs_dir=state / "logs",
            coord_db=state / "coord.db",
        )

    def ensure(self) -> None:
        self.state.mkdir(parents=True, exist_ok=True)
        self.logs_dir.mkdir(parents=True, exist_ok=True)


def build_logger(paths: Paths) -> logging.Logger:
    logger = logging.getLogger("bot_task_manager")
    logger.setLevel(logging.INFO)

    if logger.handlers:
        return logger

    ts = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = paths.logs_dir / f"resume_{ts}.log"

    formatter = logging.Formatter("%(asctime)s %(levelname)s %(message)s")

    stream = logging.StreamHandler()
    stream.setFormatter(formatter)
    logger.addHandler(stream)

    file_handler = logging.FileHandler(log_file)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    logger.info("log_file=%s", log_file)
    return logger


class BotManager:
    def __init__(
        self,
        *,
        project_id: int,
        chat_id: int,
        user_id: int,
        paths: Paths,
        logger: logging.Logger,
    ) -> None:
        self.project_id = project_id
        self.chat_id = chat_id
        self.user_id = user_id
        self.paths = paths
        self.logger = logger

    async def send(self, message: str) -> None:
        self.logger.info("SEND: %s", message)

    async def noop(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        self.logger.info("noop called args=%s kwargs=%s", args, kwargs)
        return {"status": "OK", "ok": True, "summary": "noop"}

    def callback_factory(self, project_id: int) -> dict[str, Any]:
        self.logger.info("building callbacks for project_id=%s", project_id)
        return {
            "patch_common": self.noop,
            "cmd_apply": self.noop,
            "cmd_test": self.noop,
            "cmd_servehard": self.noop,
            "cmd_doctor": self.noop,
            "cmd_run": self.noop,
            "cmd_killport": self.noop,
        }

    async def resume_once(self, answer: str) -> dict[str, Any]:
        if maybe_resume_pending_do is None:
            raise RuntimeError(
                "thebot.agent.do_loop.maybe_resume_pending_do is unavailable. "
                "Install/import thebot in this environment first."
            )

        if not self.paths.jobs_db.exists():
            self.logger.warning("jobs.db not found at %s", self.paths.jobs_db)

        result = await maybe_resume_pending_do(
            answer_text=answer,
            db_path=self.paths.jobs_db,
            logs_dir=self.paths.logs_dir,
            send=self.send,
            callback_factory=self.callback_factory,
            chat_id=self.chat_id,
            user_id=self.user_id,
        )

        if not isinstance(result, dict):
            return {"status": "UNKNOWN", "phase": "UNKNOWN", "raw": result}

        return result

    async def run_resume_flow(self, answers: Iterable[str]) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for idx, answer in enumerate(answers, start=1):
            self.logger.info("resume_step=%s answer=%r", idx, answer)
            try:
                result = await self.resume_once(answer)
            except Exception as exc:
                self.logger.exception("resume failed at step=%s", idx)
                result = {
                    "status": "ERROR",
                    "phase": "RESUME_FAILED",
                    "step": idx,
                    "answer": answer,
                    "error": str(exc),
                }
            results.append(result)
            print(f"Step {idx}: {result.get('status')} phase={result.get('phase')}")
        return results

    def fetch_task_status(self, task_id: Any) -> dict[str, Any]:
        if task_id is None:
            return {"ok": False, "error": "No task_id found in resume result"}

        if not self.paths.coord_db.exists():
            return {"ok": False, "error": f"coord.db not found at {self.paths.coord_db}"}

        with sqlite3.connect(str(self.paths.coord_db)) as conn:
            table = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'"
            ).fetchone()
            if not table:
                return {"ok": False, "error": "tasks table not found in coord.db"}

            row = conn.execute(
                "SELECT id, status, last_result_json FROM tasks WHERE id=?", (task_id,)
            ).fetchone()

        if not row:
            return {"ok": False, "error": f"task_id={task_id} not found"}

        parsed_result: Any = row[2]
        if isinstance(parsed_result, str):
            try:
                parsed_result = json.loads(parsed_result)
            except json.JSONDecodeError:
                pass

        return {
            "ok": True,
            "task_id": row[0],
            "status": row[1],
            "last_result": parsed_result,
        }


def run_coerce_argv_check() -> int:
    if _coerce_run_argv is None:
        print("_coerce_run_argv unavailable: install/import thebot first")
        return 1

    cases = [
        ("NONE", None),
        ("DICT_CMD", {"cmd": "echo hi"}),
        ("DICT_ARGV", {"argv": ["echo", "hi"]}),
        ("STRING", "echo hi"),
    ]

    for label, value in cases:
        result = _coerce_run_argv(value)
        print(f"{label}: {result}")

    return 0


def preflight_port(port: int) -> dict[str, Any]:
    lsof = shutil.which("lsof")
    if lsof:
        proc = subprocess.run(
            [lsof, f"-tiTCP:{port}", "-sTCP:LISTEN"],
            capture_output=True,
            text=True,
            check=False,
        )
        pids = [p for p in proc.stdout.split() if p.strip()]
        if pids:
            return {"ok": True, "available": False, "method": "lsof", "pids": pids}
        return {"ok": True, "available": True, "method": "lsof", "pids": []}

    # Fallback: try to bind the port locally.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(("127.0.0.1", port))
        except OSError as exc:
            return {
                "ok": True,
                "available": False,
                "method": "socket-bind",
                "error": str(exc),
            }
    return {"ok": True, "available": True, "method": "socket-bind"}


def shell_join(argv: list[str]) -> str:
    return " ".join(shlex.quote(part) for part in argv)


async def run_resume(args: argparse.Namespace) -> int:
    paths = Paths.from_state(Path(args.state).expanduser())
    paths.ensure()
    logger = build_logger(paths)

    manager = BotManager(
        project_id=args.project_id,
        chat_id=args.chat_id,
        user_id=args.user_id,
        paths=paths,
        logger=logger,
    )

    results = await manager.run_resume_flow(args.answers)
    if not results:
        print("No resume steps executed")
        return 1

    task_id = results[-1].get("task_id")
    task_status = manager.fetch_task_status(task_id)
    print("TASK_STATUS:")
    print(json.dumps(task_status, indent=2, default=str))

    if args.run_coerce_check:
        print("\nCOERCE_ARGV_CHECK:")
        run_coerce_argv_check()

    if args.port is not None:
        port_check = preflight_port(args.port)
        print("\nPORT_PREFLIGHT:")
        print(json.dumps(port_check, indent=2))

    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Resume clawbot pending tasks with robust status checks"
    )
    parser.add_argument("--state", default=str(DEFAULT_STATE), help="Path to clawbot state dir")
    parser.add_argument("--project-id", type=int, default=13)
    parser.add_argument("--chat-id", type=int, default=1603197641)
    parser.add_argument("--user-id", type=int, default=1603197641)
    parser.add_argument(
        "--answers",
        nargs="+",
        default=["3", "Pro answer: continue with best fix plan"],
        help="Answers to feed maybe_resume_pending_do in sequence",
    )
    parser.add_argument(
        "--run-coerce-check",
        action="store_true",
        help="Also run _coerce_run_argv compatibility check",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=9023,
        help="Port to check before cmd_servehard/cmd_run",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    print("RUN_COMMAND:")
    print(shell_join(["python", "scripts/bot_task_manager.py", *__import__("sys").argv[1:]]))

    return asyncio.run(run_resume(args))


if __name__ == "__main__":
    raise SystemExit(main())
