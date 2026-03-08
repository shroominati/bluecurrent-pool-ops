# Playground Playbook

## Repo Reality

Florida Wreck Signal is currently a Node/Express research dashboard with:

- `server/` for API and persistence
- `public/` for the frontend
- `data/` for local JSON-backed research data
- `scripts/telegram-codex-bot.js` as a thin Telegram bridge that shells out to `codex exec`
- `onchain/` for Solana program work

This repo does **not** currently include the full multi-agent platform runtime used by the separate `clawbot` platform repository. There is no local ticket board, control center, `/events` stream, contract compiler, executive-with-feeds runtime, JURY pipeline, or governed APPLY path in this workspace today.

## Operating Principle

Treat phases G through P as a structured roadmap for platform-style capabilities. They should only be marked live in this repo when the underlying runtime, artifacts, and control surfaces actually exist here.

## Current Status

- App runtime: live
- Telegram Codex bridge: live
- Maritime data ingestion and scoring: live
- Platform orchestration phases G-P: not implemented in this repo

## Execution Program

### Phase G — Executive With Feeds Core
Status: Planned

Outcome:
- Introduce `executive_with_feeds` as the advanced execution mode with one writer and multiple read-only thinking feeds.

Build slice:
- Define a single-writer executive boundary.
- Define feed types and packet artifacts.
- Add a scheduler that can run safe read-only feeds in parallel.
- Add feed and executive visibility to the operator surface.

Entry gate:
- A real local task/execution runtime must exist in this repo first.

Owner:
- Platform orchestration

Artifacts:
- `artifacts/executive/executive_run.json`
- `artifacts/feeds/feed_packet.<feed_type>.json`
- `artifacts/feeds/feed_context_bundle.md`

Hard success metrics:
- `100%` of advanced-mode runs have exactly one writer role.
- `100%` of feed packets are persisted with feed type and task linkage.
- `0` feed writes to tracked repo files during verification runs.

What can go wrong:
- Feed boundaries are advisory but not enforced.
- Parallel feeds overwhelm context limits instead of improving signal.
- Legacy writer paths keep bypassing the executive boundary.

Exit criteria:
- New advanced tasks default to `executive_with_feeds`.
- Feeds are read-only by design and by enforcement.
- Executive is the only writer.
- Feed packets are persisted and inspectable.

### Phase H — Contract Compiler + Feed Packet Schema
Status: Planned

Outcome:
- Require a machine-checkable contract before risky work proceeds.
- Tie every feed packet to `contract_id`.

Build slice:
- Define a versioned contract schema.
- Compile contracts from the primary work-item source.
- Add manual override fields with validation.
- Make feed scheduling contract-aware.

Entry gate:
- A local ticket/work-item model and feed scheduler must exist.

Owner:
- Execution contracts

Artifacts:
- `artifacts/contracts/contract.<task_id>.json`
- `artifacts/contracts/contract.<task_id>.md`
- `artifacts/feeds/feed_packet_index.<task_id>.json`

Hard success metrics:
- `100%` of risky tasks have a validated contract or are downgraded to planning-only.
- `100%` of feed packets reference a `contract_id`.
- `0` contract compilations proceed with schema-invalid required fields.

What can go wrong:
- Contract data forks from the source work-item model.
- Manual overrides silently bypass validation.
- Feed scheduling ignores contract-required profiles.

Exit criteria:
- Risky tasks cannot proceed without a valid contract or planning-only downgrade.
- Every feed packet references `contract_id`.
- Contract artifacts are persisted and linked from execution records.

### Phase I — Working Memory + Context Router
Status: Planned

Outcome:
- Add session working memory, task-scoped durable notes, and distilled cross-task operational memory.

Build slice:
- Add structured memory stores for session, task, and cross-task notes.
- Distill memory from completed runs and proof artifacts.
- Add dedupe, scoring, freshness, and retirement rules.
- Add a bounded context router for feeds and executive prompts.

Entry gate:
- Contracted task execution and feed packet storage must exist.

Owner:
- Memory and retrieval

Artifacts:
- `artifacts/memory/session_working_memory.<task_id>.json`
- `artifacts/memory/task_notes.<task_id>.json`
- `artifacts/memory/distilled_operational_memory.json`
- `artifacts/memory/context_router_trace.<task_id>.json`

Hard success metrics:
- Relevant retrieval precision is high enough that review flags on injected memory stay below `10%` on test fixtures.
- `100%` of retired memory entries are excluded from active routing.
- New-task injected memory stays within a fixed bounded context budget.

What can go wrong:
- Irrelevant memory pollutes feed prompts.
- Fresh but low-confidence notes outrank durable facts.
- Distillation collapses raw evidence into vague summaries.

Exit criteria:
- New tasks start with bounded relevant memory, not raw transcripts.
- Irrelevant memory is filtered out.
- Memory is inspectable through existing operator surfaces.

### Phase J — JURY + Proof-Carrying Patch Bundles
Status: Planned

Outcome:
- Require verdict artifacts and proof bundles before patch proposals can progress.

Build slice:
- Define candidate evaluation and verdict schemas.
- Add deterministic evaluators first.
- Add proof-carrying patch bundles with evidence and rollback notes.
- Use verdict reasons to steer retries.

Entry gate:
- Executive patch proposals, contracts, and proof artifact conventions must exist.

Owner:
- Verification and adjudication

Artifacts:
- `artifacts/jury/verdict.<candidate_id>.json`
- `artifacts/jury/proof_bundle.<candidate_id>.json`
- `artifacts/jury/proof_bundle.<candidate_id>.md`

Hard success metrics:
- `100%` of candidate patches require a verdict artifact before progression.
- `100%` of proof bundles include commands run, evidence refs, risk score, confidence score, and rollback notes.
- Missing-verdict gate coverage is `100%` in verification tests.

What can go wrong:
- Deterministic evaluators drift from the real APPLY environment.
- Degraded semantic mode becomes the default instead of the fallback.
- Retry loops ignore verdict reasons and repeat the same losing attempt.

Exit criteria:
- No patch proposal can progress without a verdict artifact.
- Proof bundles persist evidence, commands, results, and risk/confidence scores.
- Missing verdicts block progression.

### Phase K — Adversarial Critic Feed
Status: Planned

Outcome:
- Add read-only adversarial critic feeds that generate attacks, counterexamples, and risk escalations.

Build slice:
- Add post-patch critic feeds that emit only attack and counterexample packets.
- Route critic findings into JURY and retry logic.
- Add risk-tier policy controls for mandatory critic passes.

Entry gate:
- JURY, feed packets, and executive retry loops must exist.

Owner:
- Adversarial verification

Artifacts:
- `artifacts/critic/attack_packet.<candidate_id>.json`
- `artifacts/critic/counterexample_packet.<candidate_id>.json`
- `artifacts/critic/negative_test_plan.<candidate_id>.md`

Hard success metrics:
- `100%` of critic outputs are packet artifacts with no write-side repo effects.
- Material counterexamples reopen or block progression in `100%` of test cases.
- High-risk tasks honor critic-required policy in `100%` of policy tests.

What can go wrong:
- Critic outputs are informative but not wired into decisions.
- Counterexamples are logged as warnings instead of hard blockers.
- Critic feeds accidentally gain write authority through shared tooling.

Exit criteria:
- Material counterexamples block progression or reopen execution.
- Critic evidence is persisted and linked to contract and verdict artifacts.
- Critic feeds remain read-only under enforcement.

### Phase L — Strategy Policy Engine + Meta-Builder
Status: Planned

Outcome:
- Replace naive retries with inspectable policy-driven strategy selection and isolated meta-builder experiments.

Build slice:
- Record strategy outcomes and decision reasons.
- Add deterministic fallback policy plus exploration/exploitation.
- Add blacklisting and decay for weak strategies.
- Add isolated meta-builder experiments for feed mixes and prompt recipes.

Entry gate:
- Strategy outcomes, verdict history, and replayable task artifacts must exist.

Owner:
- Strategy and tuning

Artifacts:
- `artifacts/strategy/strategy_outcomes.json`
- `artifacts/strategy/selection_trace.<task_id>.json`
- `artifacts/strategy/meta_builder_experiment.<experiment_id>.json`

Hard success metrics:
- Sparse-history tasks fall back to deterministic defaults in `100%` of fallback tests.
- Blacklisted strategies are not selected while blacklisting remains active.
- Challenger profiles only promote when they beat the champion on defined slices.

What can go wrong:
- Exploration burns budget without producing usable signal.
- Strategy scoring becomes opaque and unreviewable.
- Meta-builder experiments accidentally mutate production trust controls.

Exit criteria:
- Retry behavior is policy-driven and inspectable.
- Sparse history falls back to stable defaults.
- Meta-builder cannot weaken trust boundaries.

### Phase M — Benchmark Lab + Internal Gold Corpus
Status: Planned

Outcome:
- Build an internal evaluation lab that measures real improvement across realistic engineering tasks.

Build slice:
- Create a gold-task corpus from real work patterns.
- Add reproducible replay and benchmark artifacts.
- Compare execution modes on shared slices.
- Add leaderboard and regression gates.

Entry gate:
- Multiple comparable execution modes and reproducible artifact trails must exist.

Owner:
- Evaluation and benchmarking

Artifacts:
- `artifacts/evals/gold_corpus_index.json`
- `artifacts/evals/eval_run.<eval_id>.json`
- `artifacts/evals/leaderboard.json`
- `artifacts/evals/replay_trace.<task_id>.json`

Hard success metrics:
- Eval runs are reproducible on replay fixtures for the same inputs.
- Champion/challenger comparisons span multiple task classes, not a single happy path.
- Regression gates block promotion when challenger performance drops on protected slices.

What can go wrong:
- The corpus overfits to easy internal tasks.
- Metrics favor speed while masking rollback or proof-quality regressions.
- Replay fixtures drift from real task conditions.

Exit criteria:
- Benchmarks can compare champion vs challenger on realistic tasks.
- Regression gates block weaker strategy promotions.
- Eval artifacts are persisted and replayable.

### Phase N — Governed Rollout Engine
Status: Planned

Outcome:
- Extend APPLY into dry-run, shadow, canary, flagged, and full rollout modes with rollback triggers.

Build slice:
- Define rollout plan and state machine artifacts.
- Add dry-run and simulator-backed modes first where live adapters do not exist.
- Add post-apply verification and rollback triggers.
- Feed rollout outcomes back into memory and strategy systems.

Entry gate:
- A real audited APPLY path and deploy/verification adapters must exist in this repo.

Owner:
- Apply and rollout safety

Artifacts:
- `artifacts/rollouts/rollout_plan.<run_id>.json`
- `artifacts/rollouts/rollout_evidence.<run_id>.json`
- `artifacts/rollouts/rollback_trace.<run_id>.json`

Hard success metrics:
- `100%` of rollout-capable applies persist rollout state and evidence.
- Approval gates remain enforced in `100%` of rollout tests.
- Rollback-trigger scenarios terminate in a safe state in simulator verification.

What can go wrong:
- Rollout states drift from actual deployment state.
- Post-deploy verifiers are too weak to catch regressions.
- Simulator-only modes are mistaken for production readiness.

Exit criteria:
- Human approvals remain enforced.
- Rollout evidence links back to contract, verdict, run, and proof bundle artifacts.
- Failing verifiers can trigger rollback in supported modes.

### Phase O — Capability Fabric + Parallel Read Tooling
Status: Planned

Outcome:
- Introduce a capability registry with explicit trust boundaries and safe parallel read-only tooling for feeds.

Build slice:
- Inventory current tools and classify trust and approval requirements.
- Add a capability registry with project-scoped configuration.
- Let feed profiles request capabilities rather than hard-code tools.
- Allow parallel read-only capability calls for feeds.

Entry gate:
- Feed profiles and a platform execution runtime must exist locally.

Owner:
- Tooling and trust boundaries

Artifacts:
- `artifacts/capabilities/capability_registry.json`
- `artifacts/capabilities/capability_health.json`
- `artifacts/capabilities/capability_invocation.<task_id>.json`

Hard success metrics:
- Approved read-only capabilities are discoverable per project in `100%` of registry tests.
- Feeds can issue parallel read-only calls without escalating to mutating surfaces.
- Disabled or approval-gated capabilities block correctly in `100%` of policy tests.

What can go wrong:
- Capability metadata gets stale and discovery becomes misleading.
- Parallel read tooling causes rate-limit or context-flood failures.
- Mutating capabilities leak into feed profiles during migration.

Exit criteria:
- Feeds can discover and use approved read-only capabilities in parallel.
- Mutating capabilities remain approval-gated and unavailable to feeds by default.
- Existing direct integrations continue to work during migration.

### Phase P — Safe Evolution Loop
Status: Planned

Outcome:
- Add champion/challenger scaffold evolution without weakening approvals, contracts, JURY, or write boundaries.

Build slice:
- Define champion/challenger profile artifacts.
- Evaluate challengers on gold tasks, replay tasks, and rollback-sensitive slices.
- Persist experiment outcomes and promotion decisions.
- Require explicit approval for promotion.

Entry gate:
- Benchmarking, rollout evidence, strategy policy, and explicit trust boundaries must already be live.

Owner:
- Platform governance

Artifacts:
- `artifacts/evolution/champion_profile.json`
- `artifacts/evolution/challenger_profile.<id>.json`
- `artifacts/evolution/comparison.<id>.json`
- `artifacts/evolution/promotion_decision.<id>.json`

Hard success metrics:
- `100%` of challenger promotions require measurable superiority plus explicit approval.
- `0` automated changes weaken approval, contract, JURY, or executive-write boundaries.
- Evolution history remains fully auditable for every experiment and promotion decision.

What can go wrong:
- The loop optimizes benchmark metrics while harming operator trust.
- Challenger profiles mutate forbidden trust-boundary settings.
- Promotion criteria become subjective and unreproducible.

Exit criteria:
- Challengers can only mutate allowed scaffold parameters.
- Trust boundaries cannot be auto-weakened.
- Promotions require measurable superiority plus policy approval.

## Program Order

Recommended sequence:

1. Phase G
2. Phase H
3. Phase I
4. Phase J
5. Phase K
6. Phase L
7. Phase M
8. Phase N
9. Phase O
10. Phase P

Reason:
- Each phase depends on artifacts, controls, and trust boundaries established by the ones before it.

If this repo is meant to remain the Florida Wreck Signal application, keep phases G-P as deferred platform backlog and focus on product-specific work.

If this repo is meant to absorb the platform runtime, first introduce a minimal local execution substrate:

1. Task/work-item model
2. Artifact storage conventions
3. Control/status UI
4. Event stream
5. Approval-aware write/apply boundary

Only after that should phases G-P move from Planned to Active.
