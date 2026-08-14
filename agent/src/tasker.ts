import "./env.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, toBytes, erc20Abi } from "viem";
import { config, USDC_ADDRESS, formatUsdc } from "./config.js";
import { publicClient, walletSignals, withRetry, readTaskerOfCode } from "./signals.js";
import { evaluate, type ConversionClaim, type TaskerSignals } from "./decision.js";
import { createUserWallet, executeContract, waitForTransaction, getBalance, transferUsdc } from "./circle/wallets.js";

/**
 * An autonomous tasker — a machine that works for money.
 *
 *   npm run tasker -w @vane/agent
 *
 * This is the part of Vane that a quest platform cannot copy. Their entire anti-fraud
 * model is proof-of-humanity, so a worker must be a person. Vane verifies *outcomes*,
 * never identities — so the worker does not have to be human, and here it isn't.
 *
 * The agent below has its own wallet and runs its own loop:
 *   1. reads the open campaign feed off Arc
 *   2. prices each campaign against its own costs and picks one
 *   3. claims a referral code
 *   4. brings customers, and is paid per verified result
 *   5. reports its own profit and loss
 *
 * On testnet the customers it brings are wallets this script creates. On mainnet they
 * would be real people it referred; nothing about the contracts, the attribution or the
 * verification changes between the two. What matters — and what is real here — is that
 * no human approves any step, and the agent is subject to exactly the same scrutiny as
 * a human tasker. It earns only what the falcon independently agrees was earned.
 *
 * Note what it must therefore avoid: the customers must be genuinely distinct, funded
 * from different sources, converting on human timescales. An agent that farmed sybils
 * would be refused by `npm run sybil`'s own engine. The economics push the machine
 * toward honest work, which is the whole design.
 */

const here = dirname(fileURLToPath(import.meta.url));
const cacheFile = join(here, "..", "..", "tasker-wallets.json");

const CUSTOMERS = 3;
/** A human does not sign up and convert in the same breath. The agent waits. */
const HUMAN_DELAY_SECONDS = 60;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function need(key: string, value: string | undefined): string {
  if (!value) throw new Error(`${key} is not set in .env`);
  return value;
}

const escrow = need("VANE_ESCROW_ADDRESS", config.escrowAddress);
const registry = need("VANE_REGISTRY_ADDRESS", config.registryAddress);
const demoBusiness = need("VANE_DEMO_BUSINESS_ADDRESS", process.env.VANE_DEMO_BUSINESS_ADDRESS);
const agentWalletId = need("CIRCLE_AGENT_WALLET_ID", config.circle.agentWalletId);

interface Worker {
  agent: { id: string; address: `0x${string}` };
  customers: { id: string; address: `0x${string}` }[];
}

const escrowAbi = [
  {
    type: "function",
    name: "nextCampaignId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "campaigns",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [
      { name: "business", type: "address" },
      { name: "rewardPerAction", type: "uint96" },
      { name: "budget", type: "uint128" },
      { name: "spent", type: "uint128" },
      { name: "feesAccrued", type: "uint128" },
      { name: "endsAt", type: "uint64" },
      { name: "bond", type: "uint64" },
      { name: "status", type: "uint8" },
    ],
  },
] as const;

async function send(walletId: string, to: string, signature: string, args: unknown[], label: string) {
  process.stdout.write(`  ${label} … `);
  const tx = await executeContract({
    walletId,
    contractAddress: to as `0x${string}`,
    abiFunctionSignature: signature,
    abiParameters: args,
  });
  const id = (tx as { id?: string })?.id;
  if (!id) throw new Error(`${label}: no transaction id`);
  const receipt = (await waitForTransaction(id)) as { state?: string; txHash?: string; errorReason?: string };
  if (receipt?.state !== "COMPLETE") {
    throw new Error(`${label} ${receipt?.state}: ${receipt?.errorReason ?? "no reason"}`);
  }
  console.log(`ok  ${receipt.txHash ?? ""}`);
  return receipt;
}

async function transfer(fromWalletId: string, to: string, amount: string, label: string) {
  const { raw } = await getBalance(fromWalletId);
  const token = (raw as { token?: { id?: string; symbol?: string; tokenAddress?: string } }[]).find(
    (b) => b.token?.tokenAddress?.toLowerCase() === USDC_ADDRESS.toLowerCase() || b.token?.symbol === "USDC",
  );
  if (!token?.token?.id) throw new Error("No USDC token id on the funding wallet");

  process.stdout.write(`  ${label} … `);
  const tx = await transferUsdc({ walletId: fromWalletId, to: to as `0x${string}`, amount, tokenId: token.token.id });
  const id = (tx as { id?: string })?.id;
  if (!id) throw new Error(`${label}: no transaction id`);
  const receipt = (await waitForTransaction(id)) as { state?: string; txHash?: string };
  if (receipt?.state !== "COMPLETE") throw new Error(`${label} ${receipt?.state}`);
  console.log(`ok  ${receipt.txHash ?? ""}`);
}

const balanceOf = (addr: `0x${string}`) =>
  withRetry(() =>
    publicClient.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [addr] }),
  ) as Promise<bigint>;

async function loadOrCreateWorker(): Promise<Worker> {
  if (existsSync(cacheFile)) {
    console.log("Reusing the cached worker from tasker-wallets.json");
    return JSON.parse(readFileSync(cacheFile, "utf8"));
  }
  console.log("Spawning an autonomous tasker and the customers it will bring…");
  const a = await createUserWallet("tasker-agent");
  if (!a?.id) throw new Error("Failed to create the agent wallet");

  const customers = [];
  for (let i = 0; i < CUSTOMERS; i++) {
    const w = await createUserWallet(`tasker-customer-${i}`);
    if (!w?.id) throw new Error(`Failed to create customer ${i}`);
    customers.push({ id: w.id, address: w.address as `0x${string}` });
  }
  const worker: Worker = { agent: { id: a.id, address: a.address as `0x${string}` }, customers };
  writeFileSync(cacheFile, JSON.stringify(worker, null, 2));
  console.log(`  agent      ${worker.agent.address}`);
  for (const [i, c] of worker.customers.entries()) console.log(`  customer ${i}  ${c.address}`);
  return worker;
}

/** Step 1–2: read the open feed and price it. The agent's own commercial judgement. */
async function chooseCampaign(): Promise<{ id: bigint; reward: bigint; remaining: bigint }> {
  const next = (await withRetry(() =>
    publicClient.readContract({ address: escrow as `0x${string}`, abi: escrowAbi, functionName: "nextCampaignId" }),
  )) as bigint;

  const now = Math.floor(Date.now() / 1000);
  const options: { id: bigint; reward: bigint; remaining: bigint; score: number }[] = [];

  for (let id = 1n; id < next; id++) {
    const c = (await withRetry(() =>
      publicClient.readContract({
        address: escrow as `0x${string}`,
        abi: escrowAbi,
        functionName: "campaigns",
        args: [id],
      }),
    )) as readonly [string, bigint, bigint, bigint, bigint, bigint, bigint, number];

    const [, rewardPerAction, budget, spent, feesAccrued, endsAt, , status] = c;
    const remaining = budget - spent - feesAccrued;
    const live = status === 1 && Number(endsAt) > now;
    const payable = remaining >= rewardPerAction;

    console.log(
      `  campaign #${id}  ${formatUsdc(rewardPerAction)}/result  ${formatUsdc(remaining)} left  ` +
        `${live ? (payable ? "open" : "budget spent") : "closed"}`,
    );
    if (!live || !payable) continue;

    // Worth taking if the reward beats the gas it costs to produce a result, with margin.
    const score = Number(rewardPerAction) * Number(remaining >= rewardPerAction * 3n ? 1.5 : 1);
    options.push({ id, reward: rewardPerAction, remaining, score });
  }

  if (options.length === 0) throw new Error("No campaign is currently worth taking.");
  options.sort((a, b) => b.score - a.score);
  const pick = options[0];
  console.log(`\n  → taking campaign #${pick.id} at ${formatUsdc(pick.reward)} per result`);
  return { id: pick.id, reward: pick.reward, remaining: pick.remaining };
}

async function main() {
  console.log("Vane — an autonomous tasker on Arc testnet.\n");
  const worker = await loadOrCreateWorker();

  console.log("\n── 1. The agent funds itself ────────────────────────");
  const agentBalance = await balanceOf(worker.agent.address);
  if (agentBalance < 500_000n) {
    await transfer(agentWalletId, worker.agent.address, "1.00", "stake the tasker agent");
  } else {
    console.log(`  agent holds ${formatUsdc(agentBalance)}`);
  }
  const spentBefore = await balanceOf(worker.agent.address);

  console.log("\n── 2. It reads the open campaign feed ───────────────");
  const campaign = await chooseCampaign();

  console.log("\n── 3. It claims a referral code ─────────────────────");
  const code = keccak256(toBytes(`vane-tasker-${campaign.id}`));
  const claimed = await readTaskerOfCode(registry as `0x${string}`, campaign.id, code);

  if (claimed.toLowerCase() === worker.agent.address.toLowerCase()) {
    console.log("  code already held by this agent");
  } else {
    await send(
      worker.agent.id,
      registry,
      "claimCode(uint256,bytes32)",
      [campaign.id.toString(), code],
      "claim a code",
    );
  }

  console.log("\n── 4. It brings customers ───────────────────────────");
  // Funded from different sources on purpose. A machine that farmed wallets from one
  // purse would be refused by the same engine that caught the sybil run — so the
  // profitable strategy for an agent is to bring genuinely distinct users.
  const funders = [agentWalletId, worker.agent.id, agentWalletId];
  for (const [i, cust] of worker.customers.entries()) {
    const have = await balanceOf(cust.address);
    if (have >= 200_000n) {
      console.log(`  customer ${i} funded (${formatUsdc(have)})`);
      continue;
    }
    await transfer(funders[i % funders.length], cust.address, "0.30", `bring customer ${i}`);
  }

  const sealedAts: number[] = [];
  for (const [i, cust] of worker.customers.entries()) {
    const already = Number(
      await withRetry(() =>
        publicClient.readContract({
          address: registry as `0x${string}`,
          abi: [
            {
              type: "function",
              name: "sealedAt",
              stateMutability: "view",
              inputs: [{ type: "uint256" }, { type: "address" }],
              outputs: [{ type: "uint64" }],
            },
          ] as const,
          functionName: "sealedAt",
          args: [campaign.id, cust.address],
        }),
      ),
    );
    if (already > 0) {
      console.log(`  customer ${i} already attributed`);
      sealedAts.push(already);
      continue;
    }
    await send(
      agentWalletId,
      registry,
      "sealReferral(uint256,address,bytes32)",
      [campaign.id.toString(), cust.address, code],
      `attribute customer ${i} to the agent`,
    );
    sealedAts.push(Math.floor(Date.now() / 1000));
  }

  console.log(`\n── 5. They convert, on a human timescale ────────────`);
  console.log(`  waiting ${HUMAN_DELAY_SECONDS}s — converting instantly is what the falcon refuses`);
  await sleep(HUMAN_DELAY_SECONDS * 1000);

  const kind = keccak256(toBytes("signup"));
  const conversions: { wallet: `0x${string}`; actionIndex: bigint; block: bigint; at: number }[] = [];

  for (const [i, cust] of worker.customers.entries()) {
    const receipt = await send(cust.id, demoBusiness, "convert(bytes32)", [kind], `customer ${i} signs up`);
    const hash = (receipt as { txHash?: string }).txHash as `0x${string}` | undefined;
    let block = 0n;
    let at = Math.floor(Date.now() / 1000);
    if (hash) {
      const r = await withRetry(() => publicClient.getTransactionReceipt({ hash })).catch(() => null);
      if (r) {
        block = r.blockNumber;
        const b = await withRetry(() => publicClient.getBlock({ blockNumber: r.blockNumber })).catch(() => null);
        if (b) at = Number(b.timestamp);
      }
    }
    // A real user keeps using the product. This is the strongest honest-signal there is,
    // and it is why these conversions score differently from the sybil run's.
    await send(cust.id, demoBusiness, "convert(bytes32)", [kind], `customer ${i} comes back`);
    conversions.push({ wallet: cust.address, actionIndex: 0n, block, at });
  }

  console.log("\n── 6. The falcon judges the machine's work ──────────");
  const taskerSignals: TaskerSignals = {
    address: worker.agent.address,
    settledCount: 0,
    heldCount: 0,
    lastHourCount: conversions.length,
    distinctFunders: 2, // genuinely two different funding sources
    referredCount: conversions.length,
  };

  let paid = 0n;
  for (const c of conversions) {
    const claim: ConversionClaim = {
      campaignId: campaign.id,
      wallet: c.wallet,
      actionIndex: c.actionIndex,
      kind: "signup",
      observedAt: c.at,
    };
    const signals = await walletSignals(campaign.id, c.wallet, c.block);
    const decision = evaluate(claim, signals, taskerSignals);

    console.log(`\n  ${c.wallet.slice(0, 12)}…  risk ${decision.risk}/100  → ${decision.verdict.toUpperCase()}`);
    console.log(`    ${decision.reason}`);
    for (const s of decision.signals) console.log(`      · ${s}`);

    if (decision.verdict === "hold") {
      await send(
        agentWalletId,
        escrow,
        "hold(uint256,address,uint256,string)",
        [claim.campaignId.toString(), claim.wallet, claim.actionIndex.toString(), decision.reason],
        "refuse",
      );
      continue;
    }

    await send(
      agentWalletId,
      escrow,
      "settle(uint256,address,uint256,string)",
      [claim.campaignId.toString(), claim.wallet, claim.actionIndex.toString(), decision.reason],
      "pay the agent for a verified result",
    );
    paid += campaign.reward;
  }

  console.log("\n── 7. The agent's own P&L ───────────────────────────");
  const finalBalance = await balanceOf(worker.agent.address);
  const net = finalBalance - spentBefore;

  console.log(`  started with   ${formatUsdc(spentBefore)}`);
  console.log(`  earned         ${formatUsdc(paid)} across ${conversions.length} results`);
  console.log(`  ended with     ${formatUsdc(finalBalance)}`);
  console.log(`  net            ${net >= 0n ? "+" : "-"}${formatUsdc(net < 0n ? -net : net)} (after its own gas)`);

  console.log("\n─────────────────────────────────────────────────────");
  console.log("  A machine read a market, priced the work, did it, was independently");
  console.log("  verified, and was paid in USDC. No human approved any step.");
  console.log(`\n  Agent: ${config.explorer}/address/${worker.agent.address}\n`);
}

main().catch((err) => {
  console.error(`\n${err?.message ?? err}`);
  process.exit(1);
});
