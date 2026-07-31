import "./env.js";
import { createPublicClient, http, defineChain, getAddress } from "viem";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Reads the deployed contracts back off Arc and checks they are wired to each other.
 *
 *   npm run verify -w @vane/contracts
 *
 * A deploy that returns an address is not the same as a deploy that is correct: the
 * constructor could have been handed the wrong registry, the wrong USDC, or an agent
 * address that is not the wallet we actually control. Every one of those fails silently
 * until the first settlement. This checks them before we build anything on top.
 */

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "out");

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.network"] } },
  testnet: true,
});

function abiOf(name: string) {
  return JSON.parse(readFileSync(join(outDir, `${name}.json`), "utf8")).abi;
}

function need(key: string): `0x${string}` {
  const v = process.env[key];
  if (!v) {
    console.error(`${key} is not set in .env — run the deploy first.`);
    process.exit(1);
  }
  return v as `0x${string}`;
}

/**
 * The public Arc RPC rate-limits aggressively and answers with -32011 "request limit
 * reached" rather than a 429. Space calls out and back off when it complains — the
 * event watcher will need the same treatment.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rpc<T>(fn: () => Promise<T>, label: string, attempts = 5): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      const out = await fn();
      await sleep(250);
      return out;
    } catch (err) {
      const limited = JSON.stringify((err as Error)?.message ?? "").includes("request limit");
      if (!limited || i === attempts - 1) throw err;
      const wait = 1_000 * 2 ** i;
      console.log(`        rate limited on ${label}, retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  throw new Error("unreachable");
}

let failures = 0;
function check(label: string, actual: string | undefined, expected: string) {
  const ok = !!actual && getAddress(actual) === getAddress(expected);
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label.padEnd(28)} ${actual ?? "(nothing)"}`);
  if (!ok) {
    failures++;
    console.log(`        expected ${expected}`);
  }
}

async function main() {
  const pub = createPublicClient({ chain: arcTestnet, transport: http() });

  const registry = need("VANE_REGISTRY_ADDRESS");
  const escrow = need("VANE_ESCROW_ADDRESS");
  const demo = need("VANE_DEMO_BUSINESS_ADDRESS");
  const agent = need("VANE_AGENT_ADDRESS");

  console.log("Bytecode present:");
  for (const [name, addr] of [
    ["ReferralRegistry", registry],
    ["VaneEscrow", escrow],
    ["DemoBusiness", demo],
  ] as const) {
    const code = await rpc(() => pub.getCode({ address: addr }), name);
    const deployed = !!code && code !== "0x";
    console.log(`  ${deployed ? "ok  " : "FAIL"}  ${name.padEnd(28)} ${addr}  ${deployed ? `${(code.length - 2) / 2} bytes` : "NO CODE"}`);
    if (!deployed) failures++;
  }

  const escrowAbi = abiOf("VaneEscrow");
  const read = <T = string>(functionName: string) =>
    rpc(
      () => pub.readContract({ address: escrow, abi: escrowAbi, functionName }),
      functionName,
    ) as Promise<T>;

  console.log("\nVaneEscrow wiring:");
  check("registry", await read("registry"), registry);
  check("usdc", await read("usdc"), USDC_ADDRESS);
  check("agent", await read("agent"), agent);
  check("feeRecipient", await read("feeRecipient"), process.env.VANE_FEE_RECIPIENT ?? agent);
  // The one that bit us: under Circle SCP, msg.sender during construction is Circle's
  // deploy factory. An admin set from msg.sender deploys and reads perfectly while being
  // an address nobody controls — setAgent and setFee are then gone forever.
  check("admin", await read("admin"), agent);

  const feeBps = await read<number>("feeBps");
  const maxFee = await read<number>("MAX_FEE_BPS");
  const grace = await read<bigint>("SETTLE_GRACE");

  console.log(`\n  fee            ${feeBps} bps (${feeBps / 100}%), ceiling ${maxFee} bps`);
  console.log(`  settle grace   ${Number(grace) / 3600}h`);

  console.log("\nDemoBusiness wiring:");
  const demoAbi = abiOf("DemoBusiness");
  const demoRead = (functionName: string) =>
    rpc(() => pub.readContract({ address: demo, abi: demoAbi, functionName }), `demo.${functionName}`) as Promise<string>;
  check("registry", await demoRead("registry"), registry);
  check("owner", await demoRead("owner"), agent);

  if (failures) {
    console.error(`\n${failures} check(s) failed. Do not build on this deployment.`);
    process.exit(1);
  }
  console.log("\nAll checks passed. The deployment is correctly wired.");
  console.log(`Explorer: https://testnet.arcscan.app/address/${escrow}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
