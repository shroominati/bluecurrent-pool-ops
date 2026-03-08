const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  clusterApiUrl,
} = require("@solana/web3.js");
const { loadDb, saveDb } = require("../server/db");

const MARKET_ID = process.env.MARKET_ID;
const DRY_RUN = String(process.env.DRY_RUN || "false").toLowerCase() === "true";
const RPC_URL = process.env.RPC_URL || clusterApiUrl("devnet");
const ESCROW_WALLET = process.env.ESCROW_WALLET || "";
const DB_FILE = process.env.DB_FILE || path.join(process.cwd(), "data", "markets-db.json");
const ESCROW_KEYPAIR_PATH =
  process.env.ESCROW_KEYPAIR_PATH ||
  path.join(os.homedir(), ".config", "solana", "id.json");

function loadKeypair(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  return Keypair.fromSecretKey(Uint8Array.from(parsed));
}

function loadDbFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`DB file not found at ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function saveDbToFile(filePath, db) {
  fs.writeFileSync(filePath, JSON.stringify(db, null, 2));
}

async function main() {
  if (!MARKET_ID) {
    throw new Error("MARKET_ID is required.");
  }

  let db;
  if (process.env.DATABASE_URL) {
    db = await loadDb();
  } else {
    db = loadDbFromFile(DB_FILE);
  }
  const market = (db.markets || []).find((item) => item.id === MARKET_ID);

  if (!market) {
    throw new Error(`Market ${MARKET_ID} not found.`);
  }

  if (market.status !== "resolved") {
    throw new Error(`Market ${MARKET_ID} must be resolved before settlement.`);
  }

  const claims = (db.claims || []).filter(
    (claim) => claim.marketId === MARKET_ID && claim.status === "pending",
  );

  if (claims.length === 0) {
    console.log(`No pending claims for market ${MARKET_ID}.`);
    return;
  }

  const connection = new Connection(RPC_URL, "confirmed");
  const escrow = DRY_RUN ? null : loadKeypair(ESCROW_KEYPAIR_PATH);
  const escrowAddress = escrow
    ? escrow.publicKey.toBase58()
    : ESCROW_WALLET || "(set ESCROW_WALLET for dry-run display)";

  let totalLamports = 0n;
  for (const claim of claims) {
    totalLamports += BigInt(claim.amountLamports);
  }

  if (!DRY_RUN) {
    const balance = await connection.getBalance(escrow.publicKey);
    if (BigInt(balance) < totalLamports) {
      throw new Error(
        `Escrow wallet has ${balance} lamports but ${totalLamports.toString()} are required.`,
      );
    }
  }

  console.log(`Settling ${claims.length} claims for market ${MARKET_ID}`);
  console.log(`Escrow wallet: ${escrowAddress}`);
  console.log(`Total payout lamports: ${totalLamports.toString()}`);
  console.log(`Dry run: ${DRY_RUN}`);

  for (const claim of claims) {
    const lamports = Number(claim.amountLamports);
    const bettor = new PublicKey(claim.bettor);

    if (DRY_RUN) {
      console.log(
        `[DRY RUN] ${claim.id}: ${claim.amountLamports} lamports -> ${claim.bettor}`,
      );
      continue;
    }

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: escrow.publicKey,
        toPubkey: bettor,
        lamports,
      }),
    );
    const sig = await sendAndConfirmTransaction(connection, tx, [escrow], {
      commitment: "confirmed",
    });

    claim.status = "paid";
    claim.payoutSignature = sig;
    claim.paidAt = new Date().toISOString();
    console.log(`Paid claim ${claim.id}: ${sig}`);
  }

  if (!DRY_RUN) {
    if (process.env.DATABASE_URL) {
      await saveDb(db);
      console.log("Settlement persisted to managed DB");
    } else {
      saveDbToFile(DB_FILE, db);
      console.log(`Settlement persisted to ${DB_FILE}`);
    }
  }
}

main().catch((error) => {
  console.error("Settlement failed:", error.message || error);
  process.exit(1);
});
