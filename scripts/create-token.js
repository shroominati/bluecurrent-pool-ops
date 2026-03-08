const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  clusterApiUrl,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  sendAndConfirmTransaction,
  Transaction,
  TransactionInstruction,
} = require("@solana/web3.js");
const {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} = require("@solana/spl-token");
const {
  getCreateMetadataAccountV3InstructionDataSerializer,
} = require("@metaplex-foundation/mpl-token-metadata");

const TOKEN_NAME = process.env.TOKEN_NAME || "Bill and Danney";
const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL || "BND";
const TOKEN_URI =
  process.env.TOKEN_URI || "https://example.com/bill-and-danney.json";
const DECIMALS = Number(process.env.DECIMALS || 8);
const SUPPLY = BigInt(process.env.SUPPLY || "69000000000");
const KEYPAIR_PATH =
  process.env.KEYPAIR_PATH || path.join(os.homedir(), ".config/solana/id.json");
const RPC_URL = process.env.RPC_URL || clusterApiUrl("devnet");

const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
);
const U64_MAX = 18446744073709551615n;

function assertConfig() {
  if (!Number.isInteger(DECIMALS) || DECIMALS < 0 || DECIMALS > 18) {
    throw new Error("DECIMALS must be an integer between 0 and 18.");
  }

  if (TOKEN_NAME.length === 0 || TOKEN_NAME.length > 32) {
    throw new Error("TOKEN_NAME must be 1-32 characters.");
  }

  if (TOKEN_SYMBOL.length === 0 || TOKEN_SYMBOL.length > 10) {
    throw new Error("TOKEN_SYMBOL must be 1-10 characters.");
  }

  if (TOKEN_URI.length === 0 || TOKEN_URI.length > 200) {
    throw new Error("TOKEN_URI must be 1-200 characters.");
  }

  if (SUPPLY <= 0n) {
    throw new Error("SUPPLY must be greater than 0.");
  }
}

function loadKeypair(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const secret = JSON.parse(raw);
    return Keypair.fromSecretKey(Uint8Array.from(secret));
  } catch (error) {
    throw new Error(
      `Unable to load KEYPAIR_PATH at ${filePath}. ` +
        "Provide a valid Solana keypair JSON file.",
    );
  }
}

async function maybeAirdrop(connection, pubkey) {
  if (!RPC_URL.includes("devnet") && !RPC_URL.includes("testnet")) {
    return;
  }

  const balance = await connection.getBalance(pubkey);
  if (balance > 0.05 * 1e9) {
    return;
  }

  console.log("Low balance detected, requesting airdrop...");
  try {
    const sig = await connection.requestAirdrop(pubkey, 1e9);
    await connection.confirmTransaction(sig, "confirmed");
    console.log("Airdrop complete:", sig);
  } catch (error) {
    console.warn(
      "Airdrop failed (rate-limited or faucet unavailable). " +
        "If you already have SOL in this wallet, the script can still proceed.",
    );
    console.warn("Airdrop error:", String(error.message || error));
  }
}

async function main() {
  assertConfig();

  const payer = loadKeypair(KEYPAIR_PATH);
  const connection = new Connection(RPC_URL, "confirmed");
  await maybeAirdrop(connection, payer.publicKey);
  const payerBalance = await connection.getBalance(payer.publicKey);
  if (payerBalance < 0.01 * 1e9) {
    throw new Error(
      `Insufficient SOL for fees in ${payer.publicKey.toBase58()}. ` +
        "Fund this wallet, then retry.",
    );
  }

  console.log("Creating mint...");
  const mint = await createMint(
    connection,
    payer,
    payer.publicKey,
    null,
    DECIMALS,
  );

  console.log("Creating associated token account...");
  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey,
  );

  const rawAmount = SUPPLY * 10n ** BigInt(DECIMALS);
  if (rawAmount > U64_MAX) {
    throw new Error(
      `Supply overflow for SPL u64 amount. Requested raw amount ${rawAmount.toString()} exceeds ${U64_MAX.toString()}. ` +
        "Lower SUPPLY or DECIMALS.",
    );
  }
  console.log("Minting supply...");
  await mintTo(connection, payer, mint, ata.address, payer, rawAmount);

  const [metadataPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID,
  );

  const metadataData = getCreateMetadataAccountV3InstructionDataSerializer().serialize(
    {
      data: {
        name: TOKEN_NAME,
        symbol: TOKEN_SYMBOL,
        uri: TOKEN_URI,
        sellerFeeBasisPoints: 0,
        creators: null,
        collection: null,
        uses: null,
      },
      isMutable: true,
      collectionDetails: null,
    },
  );

  const metadataIx = new TransactionInstruction({
    programId: TOKEN_METADATA_PROGRAM_ID,
    keys: [
      { pubkey: metadataPda, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(metadataData),
  });

  console.log("Writing token metadata...");
  const tx = new Transaction().add(metadataIx);
  await sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: "confirmed",
  });

  console.log("");
  console.log("Token created successfully.");
  console.log("Network: ", RPC_URL);
  console.log("Token name:", TOKEN_NAME);
  console.log("Mint address:", mint.toBase58());
  console.log("Owner ATA:", ata.address.toBase58());
  console.log("Supply:", SUPPLY.toString());
  console.log("Decimals:", DECIMALS);
}

main().catch((error) => {
  console.error("Failed to create token:", error);
  process.exit(1);
});
