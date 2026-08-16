import { config } from "./config.js";
import {
  publicClient,
  walletSignals,
  taskerSignals,
  sealsForTasker,
  taskerRecord,
  distinctFunders,
} from "./signals.js";
import { registryAbi } from "./abi.js";
import { evaluate, detectCluster, type ConversionClaim, type Decision } from "./decision.js";
import { executeContract, waitForTransaction } from "./circle/wallets.js";
import { screenAddress } from "./circle/compliance.js";

/**
 * One settlement pass, holding no state between runs.
 *
 * The agent watches Arc from a long-lived process on a developer's machine. That is
 * the right shape for a daemon and the wrong shape for a deployment: a judge clicking
 * through the app at midnight converts, and nothing is awake to pay them. The loop was
 * the only thing standing between a real conversion and a real settlement, and it was
 * not running anywhere the public could reach.
 *
 * So the same work, triggered by a cron instead of an event subscription. Everything
 * that decides anything is imported — `evaluate` is the one engine, and this file adds
 * no judgement of its own. What it replaces is the daemon's memory.
 *
 * Statelessness is safe because of the idempotency key, not in spite of it: a claim's
 * key is derived from campaign, wallet and action index, so re-reading a block window
 * that was already handled produces the same key and Circle refuses the duplicate.
 * That means overlapping windows cost a little time and can never double-pay.
 */

/** Arc caps eth_getLogs at 10,000 blocks, and sub-second blocks make that ~2 hours. */
const MAX_WINDOW = 9_000n;

export interface PassResult {
  scanned: { from: string; to: string };
  handled: Array<{
    campaignId: string;
    wallet: string;
    verdict: Decision["verdict"];
    reason: string;
    signals: string[];
    risk: number;
    txId?: string;
    state?: string;
  }>;
  errors: string[];
}

/**
 * Derive a tasker's record from the chain rather than from memory.
 *
 * The daemon accumulates history as it observes conversions, which a cron cannot do —
 * it wakes with no idea what it saw last time. Reading it back off the chain gives the
 * same numbers to whoever asks, which is also the more honest source: two agents
 * watching the same chain now reach the same verdict.
 *
 * Everything here was previously stubbed or misread, and every stub failed *open* — the
 * velocity, reputation and funding-concentration checks all silently scored zero in the
 * deployed settler while the demo scripts, which pass real numbers, showed all eight
 * signals working. The engine was never the problem; nothing was feeding it.
 */
async function historyFromChain(campaignId: bigint, tasker: `0x${string}`) {
  const seals = await sealsForTasker(campaignId, tasker).catch(() => []);
  const now = Math.floor(Date.now() / 1000);

  // `sealedAt` is the field these carry. Reading a `.at` that was never on the object
  // meant every timestamp became 0, every one was filtered out as falsy, and the
  // velocity check saw an empty list however fast a tasker was actually going.
  const lastHour = seals.filter((s) => s.sealedAt > 0 && now - s.sealedAt < 3600).length;

  const wallets = seals.map((s) => s.wallet);
  const [record, funders] = await Promise.all([
    taskerRecord(campaignId, tasker, wallets).catch(() => ({ settled: 0, held: 0 })),
    distinctFunders(wallets).catch(() => 0),
  ]);

  return { seals, referred: seals.length, lastHour, record, funders };
}

async function judge(
  claim: ConversionClaim,
  tasker: `0x${string}`,
  atBlock: bigint,
): Promise<Decision> {
  const wallet = await walletSignals(claim.campaignId, claim.wallet, atBlock);

  // Behavioural signals can tell a farm from an audience; they cannot know an address
  // is sanctioned. That is a registry fact, and the half of "should this be paid" the
  // engine could never compute for itself.
  wallet.compliance = await screenAddress(claim.wallet);

  // And the address that paid for this wallet to exist. Screening a Vane-created wallet
  // on its own mostly proves it is new — the funder is the one with a history.
  if (wallet.fundedBy) {
    wallet.funderCompliance = await screenAddress(wallet.fundedBy);
  }

  const { seals, referred, lastHour, record, funders } = await historyFromChain(
    claim.campaignId,
    tasker,
  );
  const cluster = detectCluster(seals);

  const signals = await taskerSignals(claim.campaignId, tasker, {
    settled: record.settled,
    held: record.held,
    lastHour,
    referred,
    // Zero means "we could not find out", and the engine skips the concentration ratio
    // rather than computing one from a placeholder. Never substitute a number here that
    // happens to land on the safe side of the threshold.
    funders,
  });

  const decision = evaluate(claim, wallet, signals, claim.observedAt);

  // A cluster is evidence about the pattern rather than the individual, so it is folded
  // in after the per-claim score rather than inside it.
  if (cluster.clustered.includes(claim.wallet) && cluster.reason) {
    decision.signals.push(cluster.reason);
    decision.risk = Math.min(100, decision.risk + 25);
    if (decision.risk >= 60) {
      decision.verdict = "hold";
      decision.reason = `Held — ${cluster.reason}.`;
    }
  }

  return decision;
}

/** The action key doubles as the idempotency key, so a retry can never double-pay. */
function keyToUuid(key: string): string {
  let h = 0x811c9dc5;
  const bytes: number[] = [];
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < key.length; j++) {
      h ^= key.charCodeAt(j) + i;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    bytes.push(h & 0xff);
  }
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function act(claim: ConversionClaim, decision: Decision) {
  if (!config.escrowAddress) throw new Error("VANE_ESCROW_ADDRESS is not set.");
  if (!config.circle.agentWalletId) throw new Error("CIRCLE_AGENT_WALLET_ID is not set.");

  const settling = decision.verdict !== "hold";
  const tx = await executeContract({
    walletId: config.circle.agentWalletId,
    contractAddress: config.escrowAddress,
    abiFunctionSignature: settling
      ? "settle(uint256,address,uint256,string)"
      : "hold(uint256,address,uint256,string)",
    abiParameters: [
      claim.campaignId.toString(),
      claim.wallet,
      claim.actionIndex.toString(),
      decision.reason,
    ],
    idempotencyKey: keyToUuid(`${claim.campaignId}:${claim.wallet}:${claim.actionIndex}`),
  });

  const id = (tx as { id?: string })?.id;
  if (!id) return {};
  const receipt = await waitForTransaction(id).catch(() => null);
  return { txId: id, state: (receipt as { state?: string })?.state };
}

/**
 * Read every conversion in a window, judge it, and settle or hold it.
 *
 * `lookback` is deliberately generous: a missed cron run must not strand somebody's
 * earnings, and reprocessing is free of consequence because of the idempotency key.
 */
export async function runPass(lookback: bigint = 2_000n): Promise<PassResult> {
  if (!config.registryAddress) throw new Error("VANE_REGISTRY_ADDRESS is not set.");

  const head = await publicClient.getBlockNumber();
  const window = lookback > MAX_WINDOW ? MAX_WINDOW : lookback;
  const from = head > window ? head - window : 0n;

  const logs = await publicClient.getContractEvents({
    address: config.registryAddress,
    abi: registryAbi,
    eventName: "ConversionRecorded",
    fromBlock: from,
    toBlock: head,
  });

  const result: PassResult = {
    scanned: { from: from.toString(), to: head.toString() },
    handled: [],
    errors: [],
  };

  for (const log of logs) {
    const args = log.args as {
      campaignId?: bigint;
      wallet?: `0x${string}`;
      actionIndex?: bigint;
      kind?: string;
      tasker?: `0x${string}`;
    };
    if (!args.campaignId || !args.wallet || args.actionIndex === undefined) continue;

    try {
      const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
      const claim: ConversionClaim = {
        campaignId: args.campaignId,
        wallet: args.wallet,
        actionIndex: args.actionIndex,
        kind: String(args.kind ?? ""),
        observedAt: Number(block.timestamp),
      };

      const decision = await judge(claim, args.tasker as `0x${string}`, log.blockNumber);
      const { txId, state } = await act(claim, decision);

      result.handled.push({
        campaignId: claim.campaignId.toString(),
        wallet: claim.wallet,
        verdict: decision.verdict,
        reason: decision.reason,
        signals: decision.signals,
        risk: decision.risk,
        txId,
        state,
      });
    } catch (err) {
      result.errors.push(`${args.campaignId}:${args.wallet}: ${(err as Error).message}`);
    }
  }

  return result;
}
