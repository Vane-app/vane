import "./env.js";
import { randomUUID } from "node:crypto";

// Dynamic import: tsx resolves the Circle SDK's CJS build, where static named imports
// fail at load. See the note in entity-secret.ts.
const { initiateDeveloperControlledWalletsClient } = await import("@circle-fin/developer-controlled-wallets");

/**
 * One-time Circle setup, before anything can be deployed.
 *
 *   npm run bootstrap -w @vane/contracts
 *
 * Creates the wallet set that will hold every Vane user wallet, and the falcon's own
 * wallet — the one that deploys the contracts and later calls settle() and hold().
 * Prints the env lines to paste back into .env.
 *
 * Safe to re-run: it will not reuse ids, so if you already have CIRCLE_WALLET_SET_ID
 * set it skips creating another set. Wallet creation is idempotency-keyed per run.
 */

const BLOCKCHAIN = process.env.CIRCLE_BLOCKCHAIN ?? "ARC-TESTNET";

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) {
    console.error(
      `\n${key} is not set.\n\n` +
        "  1. Create an API key at https://console.circle.com (Developer Controlled Wallets).\n" +
        "  2. Generate a 32-byte hex entity secret and register its ciphertext with Circle.\n" +
        "  3. Copy .env.example to .env and fill both in.\n",
    );
    process.exit(1);
  }
  return v;
}

async function main() {
  const apiKey = requireEnv("CIRCLE_API_KEY");
  const entitySecret = requireEnv("ENTITY_SECRET");

  const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

  // --- wallet set ---------------------------------------------------------
  let walletSetId = process.env.CIRCLE_WALLET_SET_ID;
  if (walletSetId) {
    console.log(`Using existing wallet set ${walletSetId}`);
  } else {
    console.log("Creating wallet set…");
    const res = await client.createWalletSet({ name: "Vane", idempotencyKey: randomUUID() });
    walletSetId = res.data?.walletSet?.id;
    if (!walletSetId) throw new Error("Circle did not return a wallet set id");
    console.log(`  walletSetId ${walletSetId}`);
  }

  // --- the falcon's wallet ------------------------------------------------
  // SCA, so Circle Paymaster can sponsor its gas. This wallet deploys the contracts
  // and is the only address the escrow will accept settle()/hold() from.
  console.log("\nCreating the agent wallet…");
  const walletRes = await client.createWallets({
    walletSetId,
    blockchains: [BLOCKCHAIN as never],
    count: 1,
    accountType: "SCA",
    metadata: [{ refId: "vane-agent" }],
    idempotencyKey: randomUUID(),
  });

  const agent = walletRes.data?.wallets?.[0];
  if (!agent) throw new Error("Circle did not return a wallet");

  console.log(`  walletId  ${agent.id}`);
  console.log(`  address   ${agent.address}`);

  console.log("\n─────────────────────────────────────────────────────────");
  console.log("Add these to .env:\n");
  console.log(`CIRCLE_WALLET_SET_ID=${walletSetId}`);
  console.log(`CIRCLE_AGENT_WALLET_ID=${agent.id}`);
  console.log(`VANE_AGENT_ADDRESS=${agent.address}`);
  console.log(`VANE_FEE_RECIPIENT=${agent.address}`);
  console.log("\n─────────────────────────────────────────────────────────");
  console.log(
    "\nNext: fund this address with Arc testnet USDC at https://faucet.circle.com\n" +
      "(select Arc Testnet). It pays for the deploy and every settlement.\n" +
      `  https://testnet.arcscan.app/address/${agent.address}\n\n` +
      "Then: npm run deploy -w @vane/contracts\n",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
