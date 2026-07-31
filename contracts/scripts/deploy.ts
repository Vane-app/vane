import "./env.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

// Dynamic import: tsx resolves the Circle SDK's CJS build, where static named imports
// fail at load. See the note in entity-secret.ts.
const { initiateSmartContractPlatformClient } = await import("@circle-fin/smart-contract-platform");

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

/**
 * Circle accepts a deploy and mines it asynchronously, so `deployContract` usually
 * returns before an address exists. Poll rather than make the operator re-run the
 * script and guess when it is ready.
 */
async function waitForAddress(
  // The published type says getContract(id: string), but at runtime it destructures
  // `{ id }` from its first argument. Passing a bare string fails with
  // "Required parameter id was null or undefined".
  scp: { getContract: (params: { id: string }) => Promise<{ data?: unknown }> },
  contractId: string,
  timeoutMs = 180_000,
): Promise<string> {
  const started = Date.now();
  process.stdout.write("  waiting for the address");
  while (Date.now() - started < timeoutMs) {
    const res = await scp.getContract({ id: contractId });
    const data = res.data as { contract?: { contractAddress?: string; status?: string } } & {
      contractAddress?: string;
      status?: string;
    };
    const contract = data?.contract ?? data;
    if (contract?.contractAddress) {
      process.stdout.write("\n");
      return contract.contractAddress;
    }
    if (contract?.status === "FAILED") {
      process.stdout.write("\n");
      throw new Error(`Deploy ${contractId} failed. Check https://console.circle.com`);
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 4_000));
  }
  process.stdout.write("\n");
  throw new Error(
    `Deploy ${contractId} had no address after ${timeoutMs / 1000}s. It may still land — check the Circle console.`,
  );
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
    // Circle rejects any non-alphanumeric character here, including hyphens and commas,
    // with a 400 that does not name the offending field. Keep these plain.
    description: "Onchain referral attribution for Vane campaigns",
    walletId,
    blockchain: BLOCKCHAIN as never,
    abiJson: JSON.stringify(registry.abi),
    bytecode: registry.bytecode,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: randomUUID(),
  });

  const registryId = registryRes.data?.contractId;
  console.log(`  contractId ${registryId}`);
  if (!registryId) throw new Error("Circle did not return a contractId for the registry");

  const registryAddress =
    registryRes.data?.contractAddress ?? (await waitForAddress(scp as never, registryId));
  console.log(`  address    ${registryAddress}`);

  const agentAddress = requireEnv("VANE_AGENT_ADDRESS");

  console.log("\nDeploying VaneEscrow to Arc…");
  const escrowRes = await scp.deployContract({
    name: "Vane Escrow",
    description: "Campaign budgets in USDC released only against verified results",
    walletId,
    blockchain: BLOCKCHAIN as never,
    abiJson: JSON.stringify(escrow.abi),
    bytecode: escrow.bytecode,
    constructorParameters: [
      USDC_ADDRESS,
      registryAddress,
      agentAddress,
      feeRecipient || agentAddress,
      agentAddress, // admin — must be explicit; msg.sender here is Circle's deploy factory
    ] as never,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: randomUUID(),
  });

  const escrowId = escrowRes.data?.contractId;
  console.log(`  contractId ${escrowId}`);
  if (!escrowId) throw new Error("Circle did not return a contractId for the escrow");
  const escrowAddress = escrowRes.data?.contractAddress ?? (await waitForAddress(scp as never, escrowId));
  console.log(`  address    ${escrowAddress}`);

  // The stand-in advertiser. Deployed alongside so the loop can be shown end to end
  // without a real business having integrated anything.
  const demo = artifact("DemoBusiness");
  console.log("\nDeploying DemoBusiness to Arc…");
  const demoRes = await scp.deployContract({
    name: "Vane DemoBusiness",
    description: "Stand in advertiser emitting verifiable onchain conversions",
    walletId,
    blockchain: BLOCKCHAIN as never,
    abiJson: JSON.stringify(demo.abi),
    bytecode: demo.bytecode,
    constructorParameters: [registryAddress, agentAddress] as never,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    idempotencyKey: randomUUID(),
  });
  const demoId = demoRes.data?.contractId;
  console.log(`  contractId ${demoId}`);
  if (!demoId) throw new Error("Circle did not return a contractId for the demo business");
  const demoAddress = demoRes.data?.contractAddress ?? (await waitForAddress(scp as never, demoId));
  console.log(`  address    ${demoAddress}`);

  const deployments = {
    chainId: 5042002,
    network: "arc-testnet",
    explorer: "https://testnet.arcscan.app",
    deployedAt: new Date().toISOString(),
    registry: { contractId: registryId, address: registryAddress },
    escrow: { contractId: escrowId, address: escrowAddress },
    demoBusiness: { contractId: demoId, address: demoAddress },
  };
  writeFileSync(join(root, "deployments.json"), JSON.stringify(deployments, null, 2));

  console.log("\nWritten to deployments.json. Add these to your .env:\n");
  console.log(`VANE_REGISTRY_ADDRESS=${registryAddress}`);
  console.log(`VANE_ESCROW_ADDRESS=${escrowAddress ?? ""}`);
  console.log(`VANE_DEMO_BUSINESS_ADDRESS=${demoAddress ?? ""}`);
  console.log(`CIRCLE_REGISTRY_CONTRACT_ID=${registryId}`);
  console.log(`CIRCLE_ESCROW_CONTRACT_ID=${escrowId}`);
  console.log(`\nExplorer: https://testnet.arcscan.app/address/${escrowAddress ?? registryAddress}`);
}

main().catch((err) => {
  // Circle returns the useful part in the response body; the SDK's Error message is
  // only ever "API parameter invalid", which says nothing about which parameter.
  const body = err?.response?.data ?? err?.data ?? null;
  if (body?.errors?.length) {
    console.error("\nCircle rejected these fields:");
    for (const e of body.errors) console.error(`  ${e.location}: ${e.message}`);
  } else if (body) {
    console.error("\nCircle response:\n", JSON.stringify(body, null, 2));
  }
  console.error(`\n${err?.message ?? err}`);
  process.exit(1);
});
