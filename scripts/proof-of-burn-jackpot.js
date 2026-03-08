const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { clusterApiUrl, Connection, Keypair, PublicKey } = require("@solana/web3.js");
const {
  TOKEN_PROGRAM_ID,
  burn,
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} = require("@solana/spl-token");

const RPC_URL = process.env.RPC_URL || clusterApiUrl("devnet");
const KEYPAIR_PATH =
  process.env.KEYPAIR_PATH || path.join(os.homedir(), ".config/solana/id.json");
const MINT_ADDRESS = process.env.MINT_ADDRESS;
const ROUND_ID = process.env.ROUND_ID || new Date().toISOString().slice(0, 10);
const ENTRY_AMOUNT = process.env.ENTRY_AMOUNT || "1000";
const JACKPOT_AMOUNT = process.env.JACKPOT_AMOUNT || "1000000";
const STREAK_BONUS_BPS = Number(process.env.STREAK_BONUS_BPS || 1000);
const STREAK_MAX_BONUS_DAYS = Number(process.env.STREAK_MAX_BONUS_DAYS || 7);
const ROUNDS_DIR = path.join(process.cwd(), "jackpot-rounds");
const STREAKS_FILE = path.join(ROUNDS_DIR, "streaks.json");
const U64_MAX = 18446744073709551615n;

function usage() {
  console.log(`
Proof-of-Burn Jackpot

Usage:
  npm run jackpot -- enter
  npm run jackpot -- draw

Required env:
  MINT_ADDRESS=<token-mint>

Optional env:
  RPC_URL=https://api.devnet.solana.com
  KEYPAIR_PATH=/absolute/path/to/id.json
  ROUND_ID=2026-03-01
  ENTRY_AMOUNT=1000
  JACKPOT_AMOUNT=1000000
  STREAK_BONUS_BPS=1000
  STREAK_MAX_BONUS_DAYS=7

What it does:
  enter: burns ENTRY_AMOUNT from caller wallet and records entry.
  draw: verifies entries, picks weighted deterministic winner, mints JACKPOT_AMOUNT.
`);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadKeypair(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const arr = JSON.parse(raw);
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  } catch (error) {
    throw new Error(
      `Unable to load keypair from ${filePath}. ` +
        "Provide a valid Solana keypair JSON file.",
    );
  }
}

function assertStreakConfig() {
  if (!Number.isInteger(STREAK_BONUS_BPS) || STREAK_BONUS_BPS < 0) {
    throw new Error("STREAK_BONUS_BPS must be an integer >= 0.");
  }

  if (!Number.isInteger(STREAK_MAX_BONUS_DAYS) || STREAK_MAX_BONUS_DAYS < 0) {
    throw new Error("STREAK_MAX_BONUS_DAYS must be an integer >= 0.");
  }
}

function readEntries(roundId) {
  const file = path.join(ROUNDS_DIR, `${roundId}.json`);
  if (!fs.existsSync(file)) {
    return { file, entries: [] };
  }

  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(parsed.entries)) {
    throw new Error(`Invalid round file format in ${file}`);
  }
  return { file, entries: parsed.entries };
}

function writeEntries(file, roundId, mintAddress, entries) {
  const payload = {
    roundId,
    mintAddress,
    updatedAt: new Date().toISOString(),
    entries,
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
}

function readStreaks() {
  if (!fs.existsSync(STREAKS_FILE)) {
    return {};
  }

  const parsed = JSON.parse(fs.readFileSync(STREAKS_FILE, "utf8"));
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Invalid streaks format in ${STREAKS_FILE}`);
  }
  return parsed;
}

function writeStreaks(streaks) {
  fs.writeFileSync(STREAKS_FILE, JSON.stringify(streaks, null, 2));
}

function getRoundDate(roundId) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(roundId)) {
    return roundId;
  }
  return new Date().toISOString().slice(0, 10);
}

function getConsecutiveDayDelta(previousDate, currentDate) {
  const prev = new Date(`${previousDate}T00:00:00.000Z`).getTime();
  const curr = new Date(`${currentDate}T00:00:00.000Z`).getTime();
  return Math.floor((curr - prev) / 86400000);
}

function computeStreakState(previous, roundDate) {
  const prevDays = Number.isInteger(previous?.streakDays) ? previous.streakDays : 0;
  const prevDate = typeof previous?.lastEntryDate === "string"
    ? previous.lastEntryDate
    : null;

  if (!prevDate) {
    return { streakDays: 1, lastEntryDate: roundDate };
  }

  if (prevDate === roundDate) {
    return { streakDays: Math.max(prevDays, 1), lastEntryDate: roundDate };
  }

  const delta = getConsecutiveDayDelta(prevDate, roundDate);
  if (delta === 1) {
    return { streakDays: Math.max(prevDays, 1) + 1, lastEntryDate: roundDate };
  }

  return { streakDays: 1, lastEntryDate: roundDate };
}

function getStreakWeightBps(streakDays) {
  const bonusDays = Math.min(
    Math.max(streakDays - 1, 0),
    STREAK_MAX_BONUS_DAYS,
  );
  return 10000 + bonusDays * STREAK_BONUS_BPS;
}

function uiAmountToRaw(amount, decimals) {
  if (!/^\d+(\.\d+)?$/.test(amount)) {
    throw new Error(`Invalid numeric amount: ${amount}`);
  }

  const [wholePart, fracPart = ""] = amount.split(".");
  if (fracPart.length > decimals) {
    throw new Error(
      `Too many decimal places in amount ${amount} for token decimals=${decimals}.`,
    );
  }

  const whole = BigInt(wholePart);
  const frac = BigInt((fracPart + "0".repeat(decimals - fracPart.length)) || "0");
  return whole * 10n ** BigInt(decimals) + frac;
}

function getEntryWeightBps(entry) {
  const raw = Number(entry.streakWeightBps);
  if (!Number.isInteger(raw) || raw <= 0) {
    return 10000;
  }
  return raw;
}

async function verifyBurnEntry(connection, mintAddress, entry) {
  const tx = await connection.getParsedTransaction(entry.burnSignature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
  if (!tx || !tx.transaction || !tx.transaction.message) {
    return false;
  }

  const parsedInstructions = tx.transaction.message.instructions;
  for (const ix of parsedInstructions) {
    const ixProgramId = ix.programId?.toBase58
      ? ix.programId.toBase58()
      : String(ix.programId || "");
    if (ixProgramId !== TOKEN_PROGRAM_ID.toBase58()) {
      continue;
    }

    if (!ix.parsed || !ix.parsed.info) {
      continue;
    }

    const type = ix.parsed.type;
    const info = ix.parsed.info;
    const isBurnType = type === "burn" || type === "burnChecked";
    if (!isBurnType) {
      continue;
    }

    if (info.mint !== mintAddress) {
      continue;
    }

    const authority = info.authority || info.owner;
    if (authority !== entry.entrant) {
      continue;
    }

    const parsedAmount =
      info.amount || (info.tokenAmount ? info.tokenAmount.amount : undefined);
    if (String(parsedAmount) !== String(entry.entryRawAmount)) {
      continue;
    }

    return true;
  }

  return false;
}

function getWeightedWinner(roundId, blockhash, entries) {
  const signatures = entries
    .map((e) => `${e.burnSignature}:${getEntryWeightBps(e)}`)
    .sort()
    .join("|");
  const material = `${roundId}|${blockhash}|${signatures}`;
  const digest = crypto.createHash("sha256").update(material).digest("hex");
  const asBig = BigInt(`0x${digest}`);

  const weights = entries.map((entry) => BigInt(getEntryWeightBps(entry)));
  const totalWeight = weights.reduce((acc, value) => acc + value, 0n);
  if (totalWeight <= 0n) {
    throw new Error("Total ticket weight is zero.");
  }

  const winnerTicket = asBig % totalWeight;
  let acc = 0n;
  let winnerIndex = 0;
  for (let i = 0; i < entries.length; i += 1) {
    acc += weights[i];
    if (winnerTicket < acc) {
      winnerIndex = i;
      break;
    }
  }

  return {
    winnerIndex,
    winnerTicket: winnerTicket.toString(),
    totalWeight: totalWeight.toString(),
    digest,
    material,
  };
}

async function runEnter() {
  if (!MINT_ADDRESS) {
    throw new Error("MINT_ADDRESS is required for enter mode.");
  }

  ensureDir(ROUNDS_DIR);
  assertStreakConfig();
  const payer = loadKeypair(KEYPAIR_PATH);
  const connection = new Connection(RPC_URL, "confirmed");
  const mint = new PublicKey(MINT_ADDRESS);
  const mintInfo = await getMint(connection, mint);
  const entryRawAmount = uiAmountToRaw(ENTRY_AMOUNT, mintInfo.decimals);
  const roundDate = getRoundDate(ROUND_ID);
  const entrant = payer.publicKey.toBase58();

  if (entryRawAmount <= 0n || entryRawAmount > U64_MAX) {
    throw new Error("ENTRY_AMOUNT is out of SPL token u64 range.");
  }

  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey,
  );

  const burnSig = await burn(
    connection,
    payer,
    ata.address,
    mint,
    payer.publicKey,
    entryRawAmount,
  );

  const streaks = readStreaks();
  const updatedStreak = computeStreakState(streaks[entrant], roundDate);
  const streakWeightBps = getStreakWeightBps(updatedStreak.streakDays);
  streaks[entrant] = {
    ...updatedStreak,
    updatedAt: new Date().toISOString(),
  };
  writeStreaks(streaks);

  const { file, entries } = readEntries(ROUND_ID);
  entries.push({
    entrant,
    burnSignature: burnSig,
    entryAmount: ENTRY_AMOUNT,
    entryRawAmount: entryRawAmount.toString(),
    entryDecimals: mintInfo.decimals,
    roundDate,
    entrantStreakDays: updatedStreak.streakDays,
    streakWeightBps,
    createdAt: new Date().toISOString(),
  });
  writeEntries(file, ROUND_ID, MINT_ADDRESS, entries);

  console.log("Entry recorded.");
  console.log("Round:", ROUND_ID);
  console.log("Entrant:", entrant);
  console.log("Entrant streak days:", updatedStreak.streakDays);
  console.log("Entry weight (bps):", streakWeightBps);
  console.log("Burn signature:", burnSig);
  console.log("Entries in round:", entries.length);
  console.log("Round file:", file);
}

async function runDraw() {
  if (!MINT_ADDRESS) {
    throw new Error("MINT_ADDRESS is required for draw mode.");
  }

  ensureDir(ROUNDS_DIR);
  assertStreakConfig();
  const payer = loadKeypair(KEYPAIR_PATH);
  const connection = new Connection(RPC_URL, "confirmed");
  const mint = new PublicKey(MINT_ADDRESS);
  const mintInfo = await getMint(connection, mint);
  const jackpotRawAmount = uiAmountToRaw(JACKPOT_AMOUNT, mintInfo.decimals);

  if (jackpotRawAmount <= 0n || jackpotRawAmount > U64_MAX) {
    throw new Error("JACKPOT_AMOUNT is out of SPL token u64 range.");
  }

  const { file, entries } = readEntries(ROUND_ID);
  if (entries.length === 0) {
    throw new Error(`No entries found for round ${ROUND_ID}.`);
  }

  console.log(`Verifying ${entries.length} entries on-chain...`);
  const verified = [];
  for (const entry of entries) {
    const ok = await verifyBurnEntry(connection, MINT_ADDRESS, entry);
    if (ok) {
      verified.push(entry);
    } else {
      console.warn("Skipping invalid entry:", entry.burnSignature);
    }
  }

  if (verified.length === 0) {
    throw new Error("No valid entries remain after on-chain verification.");
  }

  const latest = await connection.getLatestBlockhash("finalized");
  const {
    winnerIndex,
    winnerTicket,
    totalWeight,
    digest,
    material,
  } = getWeightedWinner(
    ROUND_ID,
    latest.blockhash,
    verified,
  );
  const winner = verified[winnerIndex];
  const winnerPubkey = new PublicKey(winner.entrant);

  const winnerAta = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    winnerPubkey,
  );

  const mintSig = await mintTo(
    connection,
    payer,
    mint,
    winnerAta.address,
    payer,
    jackpotRawAmount,
  );

  const result = {
    roundId: ROUND_ID,
    mintAddress: MINT_ADDRESS,
    entriesFile: file,
    totalEntries: entries.length,
    verifiedEntries: verified.length,
    latestFinalizedBlockhash: latest.blockhash,
    randomnessDigestSha256: digest,
    randomnessMaterial: material,
    totalEntryWeightBps: totalWeight,
    winnerTicketBps: winnerTicket,
    winnerIndex,
    winner,
    jackpotAmount: JACKPOT_AMOUNT,
    jackpotRawAmount: jackpotRawAmount.toString(),
    jackpotDecimals: mintInfo.decimals,
    payoutAta: winnerAta.address.toBase58(),
    payoutSignature: mintSig,
    drawnAt: new Date().toISOString(),
  };

  const resultFile = path.join(ROUNDS_DIR, `${ROUND_ID}.result.json`);
  fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));

  console.log("Draw complete.");
  console.log("Round:", ROUND_ID);
  console.log("Winner:", winner.entrant);
  console.log("Jackpot amount:", JACKPOT_AMOUNT);
  console.log("Payout signature:", mintSig);
  console.log("Result file:", resultFile);
}

async function main() {
  const mode = (process.argv[2] || "").toLowerCase();
  if (mode !== "enter" && mode !== "draw") {
    usage();
    process.exit(1);
  }

  if (mode === "enter") {
    await runEnter();
    return;
  }

  await runDraw();
}

main().catch((error) => {
  console.error("Jackpot flow failed:", error);
  process.exit(1);
});
