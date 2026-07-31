import "./env.js";
import { createPublicClient, http, defineChain, parseAbi, keccak256, toBytes } from "viem";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

/**
 * The whole loop, on real Arc, end to end.
 *
 *   npm run e2e -w @vane/contracts
 *
 * Business funds a campaign → tasker claims a code → a referred wallet converts on the
 * business's own contract → the falcon judges the evidence and settles. Real USDC moves.
 *
 * This exists as a script rather than a one-off because the demo has to be reproducible
 * on demand, and because every step is a place the integration can silently drift.
 * Wallet ids are cached in e2e-wallets.json so re-runs reuse the same actors.
 *
 * Reads go through viem (free, no Circle round-trip). Writes go through Circle Wallets,
 * which is the path the real product uses — no seed phrases anywhere.
 */

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "out");
const root = join(here, "..", "..");
const cacheFile = join(root, "e2e-wallets.json");

const { initiateDeveloperControlledWalletsClient } = await import("@circle-fin/developer-controlled-wallets");

const USDC = "0x3600000000000000000000000000000000000000" as const;
const BLOCKCHAIN = process.env.CIRCLE_BLOCKCHAIN ?? "ARC-TESTNET";

const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.network"] } },
  testnet: true,
});

const pub = createPublicClient({ chain: arcTestnet, transport: http() });

function need(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is not set in .env`);
  return v;
}

const apiKey = need("CIRCLE_API_KEY");
const entitySecret = need("ENTITY_SECRET");
const walletSetId = need("CIRCLE_WALLET_SET_ID");
const agentWalletId = need("CIRCLE_AGENT_WALLET_ID");
const escrow = need("VANE_ESCROW_ADDRESS") as `0x${string}`;
const registry = need("VANE_REGISTRY_ADDRESS") as `0x${string}`;
const demoBusiness = need("VANE_DEMO_BUSINESS_ADDRESS") as `0x${string}`;

const circle = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

const abiOf = (n: string) => JSON.parse(readFileSync(join(outDir, `${n}.json`), "utf8")).abi;
const escrowAbi = abiOf("VaneEscrow");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The public RPC answers -32011 rather than 429. Back off and retry. */
async function rpc<T>(fn: () => Promise<T>, label: string, attempts = 6): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      const out = await fn();
      await sleep(300);
      return out;
    } catch (err) {
      const msg = String((err as Error)?.message ?? "");
      if (!msg.includes("request limit") || i === attempts - 1) throw err;
      await sleep(1_000 * 2 ** i);
    }
  }
  throw new Error(`${label}: unreachable`);
}

const usdc = (base: bigint) => `$${(Number(base) / 1e6).toFixed(4)}`;

// --------------------------------------------------------------------- wallets

interface Actor {
  id: string;
  address: `0x${string}`;
}

async function loadOrCreateActors(): Promise<Record<string, Actor>> {
  if (existsSync(cacheFile)) {
    const cached = JSON.parse(readFileSync(cacheFile, "utf8"));
    console.log("Reusing cached actors from e2e-wallets.json");
    return cached;
  }

  console.log("Creating business, tasker and customer wallets…");
  const res = await circle.createWallets({
    walletSetId,
    blockchains: [BLOCKCHAIN as never],
    count: 3,
    accountType: "SCA",
    metadata: [{ refId: "e2e-business" }, { refId: "e2e-tasker" }, { refId: "e2e-customer" }],
    idempotencyKey: randomUUID(),
  });

  const w = res.data?.wallets ?? [];
  if (w.length < 3) throw new Error(`Expected 3 wallets, Circle returned ${w.length}`);

  const actors: Record<string, Actor> = {
    business: { id: w[0].id, address: w[0].address as `0x${string}` },
    tasker: { id: w[1].id, address: w[1].address as `0x${string}` },
    customer: { id: w[2].id, address: w[2].address as `0x${string}` },
  };
  writeFileSync(cacheFile, JSON.stringify(actors, null, 2));
  for (const [role, a] of Object.entries(actors)) console.log(`  ${role.padEnd(9)} ${a.address}`);
  return actors;
}

// ------------------------------------------------------------------ execution

/** Fire a contract call from a Circle wallet and wait for it to land. */
async function send(params: {
  walletId: string;
  to: `0x${string}`;
  signature: string;
  args: unknown[];
  label: string;
}) {
  process.stdout.write(`  ${params.label} … `);
  const res = await circle.createContractExecutionTransaction({
    walletId: params.walletId,
    contractAddress: params.to,
    abiFunctionSignature: params.signature,
    abiParameters: params.args as never,
    idempotencyKey: randomUUID(),
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  const id = res.data?.id;
  if (!id) throw new Error(`${params.label}: Circle returned no transaction id`);

  const terminal = new Set(["COMPLETE", "FAILED", "DENIED", "CANCELLED"]);
  const started = Date.now();
  while (Date.now() - started < 180_000) {
    const t = await circle.getTransaction({ id });
    const tx = t.data?.transaction;
    if (tx?.state && terminal.has(tx.state)) {
      if (tx.state !== "COMPLETE") {
        throw new Error(`${params.label} ${tx.state}: ${tx.errorReason ?? "no reason given"}`);
      }
      console.log(`ok  ${tx.txHash ?? ""}`);
      return tx;
    }
    await sleep(2_500);
  }
  throw new Error(`${params.label} did not reach a terminal state in 180s`);
}

/** Move USDC between Circle wallets, to fund gas and campaign budgets. */
async function fund(fromWalletId: string, to: `0x${string}`, amount: string, label: string) {
  process.stdout.write(`  ${label} … `);
  const balances = await circle.getWalletTokenBalance({ id: fromWalletId });
  const token = balances.data?.tokenBalances?.find(
    (b) => b.token?.tokenAddress?.toLowerCase() === USDC.toLowerCase() || b.token?.symbol === "USDC",
  );
  if (!token?.token?.id) throw new Error("Could not find the USDC token id on the source wallet");

  const res = await circle.createTransaction({
    walletId: fromWalletId,
    tokenId: token.token.id,
    destinationAddress: to,
    amount: [amount],
    idempotencyKey: randomUUID(),
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });

  const id = res.data?.id;
  if (!id) throw new Error(`${label}: no transaction id`);
  const terminal = new Set(["COMPLETE", "FAILED", "DENIED", "CANCELLED"]);
  const started = Date.now();
  while (Date.now() - started < 180_000) {
    const t = await circle.getTransaction({ id });
    const tx = t.data?.transaction;
    if (tx?.state && terminal.has(tx.state)) {
      if (tx.state !== "COMPLETE") throw new Error(`${label} ${tx.state}: ${tx.errorReason ?? ""}`);
      console.log(`ok  ${tx.txHash ?? ""}`);
      return tx;
    }
    await sleep(2_500);
  }
  throw new Error(`${label} timed out`);
}

const balanceOf = (addr: `0x${string}`) =>
  rpc(
    () =>
      pub.readContract({
        address: USDC,
        abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
        functionName: "balanceOf",
        args: [addr],
      }),
    "balanceOf",
  ) as Promise<bigint>;

// ----------------------------------------------------------------------- main

async function main() {
  const agentAddress = need("VANE_AGENT_ADDRESS") as `0x${string}`;
  const actors = await loadOrCreateActors();

  console.log("\n── 1. Fund the actors ───────────────────────────────");
  const falconBalance = await balanceOf(agentAddress);
  console.log(`  falcon holds ${usdc(falconBalance)}`);

  // Budget 5 USDC at 0.50 per result. Taskers and customers need only gas.
  const BUDGET = 5_000_000n;
  const REWARD = 500_000n;

  // Top up to a target rather than funding a fixed amount: re-runs leave partial balances
  // behind, and a business that looks "already funded" but cannot cover the budget fails
  // later, at approve time, with a much less obvious error.
  const GAS_HEADROOM = 1_000_000n; // 1 USDC, comfortably covers Arc gas for these calls
  for (const [role, target] of [
    ["business", BUDGET + GAS_HEADROOM],
    ["tasker", GAS_HEADROOM / 2n],
    ["customer", GAS_HEADROOM / 2n],
  ] as const) {
    const have = await balanceOf(actors[role].address);
    if (have >= target) {
      console.log(`  ${role} funded (${usdc(have)})`);
      continue;
    }
    const topUp = target - have;
    await fund(
      agentWalletId,
      actors[role].address,
      (Number(topUp) / 1e6).toFixed(6),
      `top up ${role} by ${usdc(topUp)}`,
    );
  }

  console.log("\n── 2. Business funds a campaign ─────────────────────");
  const campaignId = (await rpc(
    () => pub.readContract({ address: escrow, abi: escrowAbi, functionName: "nextCampaignId" }),
    "nextCampaignId",
  )) as bigint;
  console.log(`  campaign will be #${campaignId}`);

  await send({
    walletId: actors.business.id,
    to: USDC,
    signature: "approve(address,uint256)",
    args: [escrow, BUDGET.toString()],
    label: `approve ${usdc(BUDGET)} to the escrow`,
  });

  await send({
    walletId: actors.business.id,
    to: escrow,
    signature: "createCampaign(uint128,uint96,uint64,uint64)",
    // Seven days, not one: a 24h campaign expires overnight and every downstream demo
    // then correctly refuses to touch it, which looks like a bug and isn't.
    args: [BUDGET.toString(), REWARD.toString(), "604800", "0"],
    label: `lock ${usdc(BUDGET)} at ${usdc(REWARD)} per result`,
  });

  const locked = await balanceOf(escrow);
  console.log(`  escrow now holds ${usdc(locked)}`);

  console.log("\n── 3. Point the demo business at the campaign ───────");
  // The falcon owns DemoBusiness (it deployed it); the business owns the campaign.
  await send({
    walletId: agentWalletId,
    to: demoBusiness,
    signature: "setCampaign(uint256)",
    args: [campaignId.toString()],
    label: "demo business joins the campaign",
  });
  await send({
    walletId: actors.business.id,
    to: registry,
    signature: "setReporter(uint256,address,bool)",
    args: [campaignId.toString(), demoBusiness, true],
    label: "authorise the product to report conversions",
  });

  console.log("\n── 4. Tasker claims a referral code ─────────────────");
  const code = keccak256(toBytes(`vane-e2e-${campaignId}`)) as `0x${string}`;
  await send({
    walletId: actors.tasker.id,
    to: registry,
    signature: "claimCode(uint256,bytes32)",
    args: [campaignId.toString(), code],
    label: `claim code ${code.slice(0, 12)}…`,
  });

  console.log("\n── 5. A referred customer arrives ───────────────────");
  // Sealed before any conversion exists — this is what makes attribution unrewritable.
  await send({
    walletId: agentWalletId,
    to: registry,
    signature: "sealReferral(uint256,address,bytes32)",
    args: [campaignId.toString(), actors.customer.address, code],
    label: "seal the customer to the tasker",
  });

  console.log("\n── 6. The customer converts ─────────────────────────");
  const kind = keccak256(toBytes("signup")) as `0x${string}`;
  await send({
    walletId: actors.customer.id,
    to: demoBusiness,
    signature: "convert(bytes32)",
    args: [kind],
    label: "customer signs up on the product",
  });

  console.log("\n── 7. The falcon settles ────────────────────────────");
  const taskerBefore = await balanceOf(actors.tasker.address);
  await send({
    walletId: agentWalletId,
    to: escrow,
    signature: "settle(uint256,address,uint256,string)",
    args: [
      campaignId.toString(),
      actors.customer.address,
      "0",
      "Verified — referral sealed on-chain before the conversion and the account looks genuine.",
    ],
    label: "settle the verified result",
  });
  const taskerAfter = await balanceOf(actors.tasker.address);

  console.log("\n─────────────────────────────────────────────────────");
  console.log(`  tasker earned  ${usdc(taskerAfter - taskerBefore)}`);
  console.log(`  escrow holds   ${usdc(await balanceOf(escrow))}`);
  console.log(`  remaining      ${usdc(
    (await rpc(
      () => pub.readContract({ address: escrow, abi: escrowAbi, functionName: "remaining", args: [campaignId] }),
      "remaining",
    )) as bigint,
  )}`);
  console.log("\n  Explorer:");
  console.log(`    escrow   https://testnet.arcscan.app/address/${escrow}`);
  console.log(`    tasker   https://testnet.arcscan.app/address/${actors.tasker.address}`);
  console.log("\nThe loop closed. Real USDC moved against verified on-chain evidence.\n");
}

main().catch((err) => {
  const body = err?.response?.data;
  if (body?.errors?.length) for (const e of body.errors) console.error(`  ${e.location}: ${e.message}`);
  else if (body) console.error(JSON.stringify(body, null, 2));
  console.error(`\n${err?.message ?? err}`);
  process.exit(1);
});
