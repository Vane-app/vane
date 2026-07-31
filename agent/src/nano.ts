import "./env.js";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, toBytes, erc20Abi } from "viem";
import { config, USDC_ADDRESS, formatUsdc } from "./config.js";
import { publicClient, withRetry } from "./signals.js";
import { executeContract, waitForTransaction, getBalance, transferUsdc } from "./circle/wallets.js";

/**
 * Nanopayments — streaming revenue share at sub-cent granularity.
 *
 *   npm run nano -w @vane/agent
 *
 * A referral is not a one-off event. The person you brought keeps trading, keeps
 * depositing, keeps using the product — and on Vane the tasker earns every single time,
 * in fractions of a cent, forever.
 *
 * No affiliate network can do this. Their rails cost more per payment than the payment
 * is worth, which is exactly why the industry settles monthly, in arrears, above a $50
 * minimum. A campaign there is a bounty. Here it is an ongoing claim on the value the
 * referral keeps producing.
 *
 * `settleBatch` is what makes it economic: many payouts amortised into one transaction,
 * each independently idempotent, so a duplicate inside a batch is skipped rather than
 * reverting and blocking an honest tasker's money.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

/** $0.002 per action — a fifth of a cent. Uneconomic on any traditional rail. */
const REWARD = 2_000n;
const BUDGET = 500_000n; // $0.50 funds 240 of them
/** Each referred customer keeps using the product this many times. */
const ACTIONS_EACH = 4;

function need(key: string, value: string | undefined): string {
  if (!value) throw new Error(`${key} is not set in .env`);
  return value;
}

const escrow = need("VANE_ESCROW_ADDRESS", config.escrowAddress);
const registry = need("VANE_REGISTRY_ADDRESS", config.registryAddress);
const demoBusiness = need("VANE_DEMO_BUSINESS_ADDRESS", process.env.VANE_DEMO_BUSINESS_ADDRESS);
const agentWalletId = need("CIRCLE_AGENT_WALLET_ID", config.circle.agentWalletId);

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
  if (!token?.token?.id) throw new Error("No USDC token id");
  process.stdout.write(`  ${label} … `);
  const tx = await transferUsdc({ walletId: fromWalletId, to: to as `0x${string}`, amount, tokenId: token.token.id });
  const id = (tx as { id?: string })?.id;
  if (!id) throw new Error(`${label}: no transaction id`);
  const r = (await waitForTransaction(id)) as { state?: string };
  if (r?.state !== "COMPLETE") throw new Error(`${label} ${r?.state}`);
  console.log("ok");
}

const balanceOf = (addr: `0x${string}`) =>
  withRetry(() =>
    publicClient.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [addr] }),
  ) as Promise<bigint>;

async function main() {
  console.log("Vane — streaming revenue share at sub-cent granularity.\n");

  const e2eFile = join(root, "e2e-wallets.json");
  const taskerFile = join(root, "tasker-wallets.json");
  if (!existsSync(e2eFile) || !existsSync(taskerFile)) {
    throw new Error("Run `npm run e2e -w @vane/contracts` and `npm run tasker -w @vane/agent` first.");
  }
  const e2e = JSON.parse(readFileSync(e2eFile, "utf8")) as { business: { id: string; address: `0x${string}` } };
  const worker = JSON.parse(readFileSync(taskerFile, "utf8")) as {
    agent: { id: string; address: `0x${string}` };
    customers: { id: string; address: `0x${string}` }[];
  };

  console.log("── 1. A business posts a revenue-share campaign ─────");
  console.log(`  ${formatUsdc(REWARD)} per action — a fifth of a cent, paid every time`);

  const campaignId = (await withRetry(() =>
    publicClient.readContract({
      address: escrow as `0x${string}`,
      abi: [
        { type: "function", name: "nextCampaignId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
      ] as const,
      functionName: "nextCampaignId",
    }),
  )) as bigint;

  const businessBalance = await balanceOf(e2e.business.address);
  if (businessBalance < BUDGET + 500_000n) {
    await transfer(agentWalletId, e2e.business.address, "1.50", "top up the business");
  }

  await send(e2e.business.id, USDC_ADDRESS, "approve(address,uint256)", [escrow, BUDGET.toString()], "approve budget");
  await send(
    e2e.business.id,
    escrow,
    "createCampaign(uint128,uint96,uint64,uint64)",
    [BUDGET.toString(), REWARD.toString(), "604800", "0"],
    `lock ${formatUsdc(BUDGET)} at ${formatUsdc(REWARD)} per action`,
  );
  console.log(`  campaign #${campaignId} is live`);

  await send(agentWalletId, demoBusiness, "setCampaign(uint256)", [campaignId.toString()], "product joins the campaign");
  await send(
    e2e.business.id,
    registry,
    "setReporter(uint256,address,bool)",
    [campaignId.toString(), demoBusiness, true],
    "authorise conversion reporting",
  );

  console.log("\n── 2. The autonomous tasker takes it ────────────────");
  const code = keccak256(toBytes(`vane-nano-${campaignId}`));
  await send(
    worker.agent.id,
    registry,
    "claimCode(uint256,bytes32)",
    [campaignId.toString(), code],
    "agent claims a code",
  );

  for (const [i, c] of worker.customers.entries()) {
    await send(
      agentWalletId,
      registry,
      "sealReferral(uint256,address,bytes32)",
      [campaignId.toString(), c.address, code],
      `attribute customer ${i}`,
    );
  }

  console.log("\n── 3. Referred customers keep using the product ─────");
  // This is the part a bounty cannot express: the same customer, again and again.
  const kind = keccak256(toBytes("trade"));
  const wallets: string[] = [];
  const actionIndexes: string[] = [];

  for (const [i, c] of worker.customers.entries()) {
    for (let n = 0; n < ACTIONS_EACH; n++) {
      await send(c.id, demoBusiness, "convert(bytes32)", [kind], `customer ${i} trades (#${n + 1})`);
      wallets.push(c.address);
      actionIndexes.push(String(n));
    }
  }

  console.log("\n── 4. One transaction settles all of them ───────────");
  const before = await balanceOf(worker.agent.address);
  const escrowBefore = await balanceOf(escrow as `0x${string}`);

  const receipt = await send(
    agentWalletId,
    escrow,
    "settleBatch(uint256,address[],uint256[],string)",
    [
      campaignId.toString(),
      wallets,
      actionIndexes,
      "Verified — ongoing product usage from attributed referrals.",
    ],
    `settle ${wallets.length} payouts in one batch`,
  );

  const after = await balanceOf(worker.agent.address);
  const escrowAfter = await balanceOf(escrow as `0x${string}`);
  const earned = after - before;
  const moved = escrowBefore - escrowAfter;

  // Gas actually paid for the whole batch, from the receipt — not an estimate.
  const hash = (receipt as { txHash?: string }).txHash as `0x${string}` | undefined;
  let gasUsed = 0n;
  let effectivePrice = 0n;
  if (hash) {
    const r = await withRetry(() => publicClient.getTransactionReceipt({ hash })).catch(() => null);
    if (r) {
      gasUsed = r.gasUsed;
      effectivePrice = r.effectiveGasPrice ?? 0n;
    }
  }
  const gasCostWei = gasUsed * effectivePrice; // native view, 18dp

  console.log("\n─────────────────────────────────────────────────────");
  console.log(`  payouts settled     ${wallets.length}`);
  console.log(`  transactions        1`);
  console.log(`  tasker earned       ${formatUsdc(earned)}`);
  console.log(`  left the escrow     ${formatUsdc(moved)}  (payouts + fee)`);
  console.log(`  per payout          $${(Number(earned) / 1e6 / wallets.length).toFixed(6)}`);
  if (gasCostWei > 0n) {
    const gasUsdc = Number(gasCostWei) / 1e18;
    console.log(`  gas for the batch   $${gasUsdc.toFixed(6)}`);
    console.log(`  gas per payout      $${(gasUsdc / wallets.length).toFixed(8)}`);
  }
  if (gasCostWei > 0n) {
    const gasPerPayout = Number(gasCostWei) / 1e18 / wallets.length;
    const ratio = (gasPerPayout / (Number(REWARD) / 1e6)) * 100;
    console.log(`  gas as % of payout  ${ratio.toFixed(1)}%`);
    console.log(
      `\n  Honest reading: batching is what makes ${formatUsdc(REWARD)} payouts possible at all,`,
    );
    console.log(
      `  but at this size gas is ${ratio.toFixed(0)}% of the payout. The economics want either a`,
    );
    console.log(`  larger batch or a rate nearer $0.01. A card rail cannot do it at any size.`);
  }
  console.log(`\n  Escrow: ${config.explorer}/address/${escrow}\n`);
}

main().catch((err) => {
  console.error(`\n${err?.message ?? err}`);
  process.exit(1);
});
