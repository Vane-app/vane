import "dotenv/config";
import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

/**
 * Deploys the Vane contracts to Arc through Circle's Smart Contract Platform.
 *
 *   npm run compile -w @vane/contracts
 *   npm run deploy  -w @vane/contracts
 *
 * Deploying via SCP rather than a raw signer means the contracts, their ABIs and
 * the wallets that call them all live in one place, and the deploy is signed by a
 * Circle-custodied wallet — no private key on disk.
 */

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "out");
const root = join(here, "..", "..");

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const BLOCKCHAIN = process.env.CIRCLE_BLOCKCHAIN ?? "ARC-TESTNET";

function artifact(name: string) {
  const path = join(outDir, `${name}.json`);
  if (!existsSync(path)) {
    console.error(`Missing ${path}. Run: npm run compile -w @vane/contracts`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, "utf8")) as { abi: unknown; bytecode: string };
}

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) {
    console.error(`${key} is not set. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const apiKey = requireEnv("CIRCLE_API_KEY");
  const entitySecret = requireEnv("ENTITY_SECRET");
  const walletId = requireEnv("CIRCLE_AGENT_WALLET_ID");
  const feeRecipient = process.env.VANE_FEE_RECIPIENT ?? "";

  const scp = initiateSmartContractPlatformClient({ apiKey, entitySecret });

  const registry = artifact("ReferralRegistry");
  const escrow = artifact("VaneEscrow");

  console.log("Deploying ReferralRegistry to Arc…");
  const registryRes = await scp.deployContract({
    name: "Vane ReferralRegistry",
    description: "On-chain referral attribution for Vane campaigns",
    walletId,
    blockchain: BLOCKCHAIN as never,
    abiJson: JSON.stringify(registry.abi),
    bytecode: registry.bytecode,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: randomUUID(),
  });

  const registryId = registryRes.data?.contractId;
  const registryAddress = registryRes.data?.contractAddress;
  console.log(`  contractId ${registryId}`);
  console.log(`  address    ${registryAddress ?? "(pending — check the console)"}`);

  if (!registryAddress) {
    console.log("\nRegistry address is still pending. Re-run once it is confirmed to deploy the escrow.");
    return;
  }

  const agentAddress = requireEnv("VANE_AGENT_ADDRESS");

  console.log("\nDeploying VaneEscrow to Arc…");
  const escrowRes = await scp.deployContract({
    name: "Vane Escrow",
    description: "Campaign budgets in USDC, released only against verified results",
    walletId,
    blockchain: BLOCKCHAIN as never,
    abiJson: JSON.stringify(escrow.abi),
    bytecode: escrow.bytecode,
    constructorParameters: [
      USDC_ADDRESS,
      registryAddress,
      agentAddress,
      feeRecipient || agentAddress,
    ] as never,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: randomUUID(),
  });

  const escrowId = escrowRes.data?.contractId;
  const escrowAddress = escrowRes.data?.contractAddress;
  console.log(`  contractId ${escrowId}`);
  console.log(`  address    ${escrowAddress ?? "(pending)"}`);

  const deployments = {
    chainId: 5042002,
    network: "arc-testnet",
    explorer: "https://testnet.arcscan.app",
    deployedAt: new Date().toISOString(),
    registry: { contractId: registryId, address: registryAddress },
    escrow: { contractId: escrowId, address: escrowAddress },
  };
  writeFileSync(join(root, "deployments.json"), JSON.stringify(deployments, null, 2));

  console.log("\nWritten to deployments.json. Add these to your .env:\n");
  console.log(`VANE_REGISTRY_ADDRESS=${registryAddress}`);
  console.log(`VANE_ESCROW_ADDRESS=${escrowAddress ?? ""}`);
  console.log(`CIRCLE_REGISTRY_CONTRACT_ID=${registryId}`);
  console.log(`CIRCLE_ESCROW_CONTRACT_ID=${escrowId}`);
  console.log(`\nExplorer: https://testnet.arcscan.app/address/${escrowAddress ?? registryAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
