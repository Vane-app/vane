import "./env.js";
import { createWalletClient, createPublicClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Deploys the Vane contracts to Arc with a raw funded key.
 *
 *   npm run deploy:viem -w @vane/contracts
 *
 * The Smart Contract Platform path (deploy.ts) is the one we present: no private key
 * ever touches disk. This exists because a deploy is the single point in the build
 * where being blocked costs a whole day, and a second independent path costs an hour.
 * Requires DEPLOYER_PRIVATE_KEY, funded from faucet.circle.com.
 */

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "out");
const root = join(here, "..", "..");

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;

const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.network"] } },
  blockExplorers: { default: { name: "Arcscan", url: "https://testnet.arcscan.app" } },
  testnet: true,
});

function artifact(name: string) {
  const path = join(outDir, `${name}.json`);
  if (!existsSync(path)) {
    console.error(`Missing ${path}. Run: npm run compile -w @vane/contracts`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, "utf8")) as { abi: never; bytecode: `0x${string}` };
}

async function main() {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) {
    console.error(
      "\nDEPLOYER_PRIVATE_KEY is not set.\n\n" +
        "This is the fallback path. Prefer: npm run deploy -w @vane/contracts\n",
    );
    process.exit(1);
  }

  const account = privateKeyToAccount(key.startsWith("0x") ? (key as `0x${string}`) : `0x${key}`);
  const wallet = createWalletClient({ account, chain: arcTestnet, transport: http() });
  const pub = createPublicClient({ chain: arcTestnet, transport: http() });

  console.log(`Deployer ${account.address}`);
  const balance = await pub.getBalance({ address: account.address });
  console.log(`Balance  ${balance} (native view, 18dp)`);
  if (balance === 0n) {
    console.error("\nDeployer has no gas. Fund it at https://faucet.circle.com (Arc Testnet).\n");
    process.exit(1);
  }

  async function deploy(name: string, args: readonly unknown[] = []) {
    const a = artifact(name);
    console.log(`\nDeploying ${name}…`);
    const hash = await wallet.deployContract({ abi: a.abi, bytecode: a.bytecode, args: args as never });
    console.log(`  tx ${hash}`);
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (!receipt.contractAddress) throw new Error(`${name} deploy produced no address`);
    console.log(`  address ${receipt.contractAddress}`);
    return receipt.contractAddress;
  }

  const registryAddress = await deploy("ReferralRegistry");

  const agentAddress = (process.env.VANE_AGENT_ADDRESS as `0x${string}`) ?? account.address;
  const feeRecipient = (process.env.VANE_FEE_RECIPIENT as `0x${string}`) || agentAddress;

  const escrowAddress = await deploy("VaneEscrow", [
    USDC_ADDRESS,
    registryAddress,
    agentAddress,
    feeRecipient,
    account.address, // admin
  ]);
  const demoAddress = await deploy("DemoBusiness", [registryAddress, account.address]);

  const deployments = {
    chainId: arcTestnet.id,
    network: "arc-testnet",
    explorer: "https://testnet.arcscan.app",
    deployedAt: new Date().toISOString(),
    deployedVia: "viem",
    registry: { address: registryAddress },
    escrow: { address: escrowAddress, agent: agentAddress, feeRecipient },
    demoBusiness: { address: demoAddress },
  };
  writeFileSync(join(root, "deployments.json"), JSON.stringify(deployments, null, 2));

  console.log("\n─────────────────────────────────────────────────────────");
  console.log("Written to deployments.json. Add to .env:\n");
  console.log(`VANE_REGISTRY_ADDRESS=${registryAddress}`);
  console.log(`VANE_ESCROW_ADDRESS=${escrowAddress}`);
  console.log(`VANE_DEMO_BUSINESS_ADDRESS=${demoAddress}`);
  console.log(`\nExplorer: https://testnet.arcscan.app/address/${escrowAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
