import "dotenv/config";
import { config, formatUsdc } from "./config.js";
import { publicClient } from "./signals.js";
import { registryAbi } from "./abi.js";
import { evaluate, detectCluster, type ConversionClaim } from "./decision.js";
import { walletSignals, taskerSignals, sealsForTasker } from "./signals.js";
import { executeContract, waitForTransaction } from "./circle/wallets.js";

/**
 * Vane — the falcon.
 *
 * Watches Arc for verified conversions, judges each one against on-chain evidence,
 * and settles or refuses it. Every decision is written down in the same transaction
 * that moves the money, so the business can audit the agent instead of trusting it.
 *
 * The agent holds no user funds. It can call settle() and hold() on the vault and
 * nothing else, and settle() can only pay the tasker the registry sealed before the
 * conversion happened. A stolen agent key cannot steal a campaign budget.
 */

interface TaskerHistory {
  settled: number;
  held: number;
  referred: number;
  funders: number;
  recent: number[];
}

const history = new Map<string, TaskerHistory>();
/** Idempotency — never judge the same action twice, even across a restart mid-block. */
const handled = new Set<string>();

function historyFor(tasker: string): TaskerHistory {
  let h = history.get(tasker);
  if (!h) {
    h = { settled: 0, held: 0, referred: 0, funders: 0, recent: [] };
    history.set(tasker, h);
  }
  return h;
}

function lastHour(h: TaskerHistory, now: number) {
  h.recent = h.recent.filter((t) => now - t < 3600);
  return h.recent.length;
}

export async function judge(
  claim: ConversionClaim,
  tasker: `0x${string}`,
  blockNumber: bigint,
): Promise<{ verdict: string; reason: string; risk: number; signals: string[] }> {
  const now = Math.floor(Date.now() / 1000);
  const h = historyFor(tasker);

  const wallet = await walletSignals(claim.campaignId, claim.wallet, blockNumber);

  const seals = await sealsForTasker(claim.campaignId, tasker).catch(() => []);
  h.referred = seals.length;
  const cluster = detectCluster(seals);

  const signals = await taskerSignals(claim.campaignId, tasker, {
    settled: h.settled,
    held: h.held,
    lastHour: lastHour(h, now),
    referred: h.referred,
    funders: h.funders || Math.max(1, h.referred),
  });

  const decision = evaluate(claim, wallet, signals, now);

  // A cluster is evidence about the pattern, not the individual — fold it in here.
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

async function act(claim: ConversionClaim, decision: Awaited<ReturnType<typeof judge>>, tasker: string) {
  if (!config.escrowAddress) throw new Error("VANE_ESCROW_ADDRESS is not set.");
  if (!config.circle.agentWalletId) throw new Error("CIRCLE_AGENT_WALLET_ID is not set.");

  const h = historyFor(tasker);
  const key = `${claim.campaignId}:${claim.wallet}:${claim.actionIndex}`;

  const settling = decision.verdict !== "hold";
  const fn = settling
    ? "settle(uint256,address,uint256,string)"
    : "hold(uint256,address,uint256,string)";

  const tx = await executeContract({
    walletId: config.circle.agentWalletId,
    contractAddress: config.escrowAddress,
    abiFunctionSignature: fn,
    abiParameters: [
      claim.campaignId.toString(),
      claim.wallet,
      claim.actionIndex.toString(),
      decision.reason,
    ],
    // The action key doubles as the idempotency key: a retry can never double-pay.
    idempotencyKey: keyToUuid(key),
  });

  if (settling) {
    h.settled += 1;
    h.recent.push(Math.floor(Date.now() / 1000));
  } else {
    h.held += 1;
  }

  const id = (tx as { id?: string })?.id;
  if (id) {
    const receipt = await waitForTransaction(id).catch(() => null);
    return { txId: id, state: (receipt as { state?: string })?.state };
  }
  return { txId: undefined, state: undefined };
}

/** Deterministic UUID from an action key, so retries reuse the same idempotency key. */
function keyToUuid(key: string): string {
  let h1 = 0x811c9dc5;
  const bytes: number[] = [];
  for (let i = 0; i < key.length; i++) {
    h1 ^= key.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    bytes.push(h1 & 0xff, (h1 >> 8) & 0xff);
  }
  while (bytes.length < 16) bytes.push(bytes.length * 7 + 13);
  const hex = bytes
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function main() {
  if (!config.registryAddress) {
    console.error("VANE_REGISTRY_ADDRESS is not set. Deploy the contracts first: npm run deploy -w contracts");
    process.exit(1);
  }

  console.log("Vane agent online.");
  console.log(`  chain     Arc testnet (${config.chain.id})`);
  console.log(`  registry  ${config.registryAddress}`);
  console.log(`  escrow    ${config.escrowAddress ?? "(not set)"}`);
  console.log(`  explorer  ${config.explorer}`);
  console.log("Watching for conversions.\n");

  publicClient.watchContractEvent({
    address: config.registryAddress,
    abi: registryAbi,
    eventName: "ConversionRecorded",
    onLogs: async (logs) => {
      for (const log of logs) {
        const key = `${log.args.campaignId}:${log.args.wallet}:${log.args.actionIndex}`;
        if (handled.has(key)) continue;
        handled.add(key);

        try {
          const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
          const claim: ConversionClaim = {
            campaignId: log.args.campaignId as bigint,
            wallet: log.args.wallet as `0x${string}`,
            actionIndex: log.args.actionIndex as bigint,
            kind: String(log.args.kind ?? ""),
            observedAt: Number(block.timestamp),
          };
          const tasker = log.args.tasker as `0x${string}`;

          const decision = await judge(claim, tasker, log.blockNumber);

          const mark = decision.verdict === "hold" ? "HELD" : "PAID";
          console.log(`${mark}  campaign ${claim.campaignId}  wallet ${claim.wallet.slice(0, 10)}…`);
          console.log(`      ${decision.reason}`);
          for (const s of decision.signals) console.log(`      · ${s}`);

          const res = await act(claim, decision, tasker);
          if (res.txId) console.log(`      tx ${res.txId} ${res.state ?? ""}`);
          console.log();
        } catch (err) {
          handled.delete(key); // allow a retry on transient failure
          console.error(`  error handling ${key}:`, (err as Error).message);
        }
      }
    },
  });
}

if (process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { formatUsdc };
