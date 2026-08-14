import { createPublicClient, http, defineChain, parseAbi } from "viem";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "./db/client";

/**
 * Reading Arc from the app.
 *
 * The falcon's decisions are already public: every settlement and every refusal is an
 * event on VaneEscrow, carrying the reason it was given. The dashboard used to show an
 * illustrative loop instead, which was the weakest possible version of the strongest
 * thing here — a business's deepest fear is paying for fraud, and the answer is a list
 * of refusals it can verify itself.
 *
 * Reads only. No key, no signing, nothing that can move money.
 */

export const ARC_TESTNET_ID = 5042002;
export const EXPLORER = "https://testnet.arcscan.app";

const arcTestnet = defineChain({
  id: ARC_TESTNET_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL ?? "https://rpc.testnet.arc.network"] } },
  testnet: true,
});

export const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });

const escrowReads = parseAbi([
  "function nextCampaignId() view returns (uint256)",
  "function campaigns(uint256) view returns (address business, uint96 rewardPerAction, uint128 budget, uint128 spent, uint128 feesAccrued, uint64 endsAt, uint64 bond, uint8 status)",
]);

/**
 * The id the next `createCampaign` will be given.
 *
 * A campaign posted in the app has to know its on-chain id, or nothing downstream
 * works: the take-flow cannot seal a referral without it, and the falcon can never
 * settle a conversion it cannot attribute. The app was creating escrow challenges and
 * then discarding this, so campaigns posted through the UI were permanently
 * unsettleable while the scripts worked fine.
 *
 * Read immediately before the funding challenge, exactly as `e2e.ts` does.
 */
export async function nextEscrowCampaignId(escrow: `0x${string}`): Promise<number> {
  const id = await withRetry(() =>
    publicClient.readContract({ address: escrow, abi: escrowReads, functionName: "nextCampaignId" }),
  );
  return Number(id);
}

/** Whether a campaign id actually exists on-chain and is funded — used to confirm. */
export async function escrowCampaign(escrow: `0x${string}`, id: bigint) {
  const c = await withRetry(() =>
    publicClient.readContract({ address: escrow, abi: escrowReads, functionName: "campaigns", args: [id] }),
  );
  const [business, rewardPerAction, budget, spent, , endsAt, , status] = c;
  return {
    business: business as `0x${string}`,
    rewardPerAction: String(rewardPerAction),
    budget: String(budget),
    spent: String(spent),
    endsAt: Number(endsAt),
    status: Number(status),
    funded: BigInt(budget) > BigInt(0),
  };
}

const registryReads = parseAbi([
  "function taskerFor(uint256 campaignId, address wallet) view returns (address)",
]);

/**
 * The falcon's decisions about one tasker's own work.
 *
 * `Settled` carries the tasker, so those filter directly. `Held` only carries the
 * converting wallet — the refusal is recorded against the claim, not the claimant —
 * so each one is resolved back through the registry seal.
 *
 * A tasker seeing why their work was refused matters more than the business seeing it.
 * The business is protecting a budget; the tasker lost a payout and is owed the reason.
 */
export async function decisionsForTasker(params: {
  escrow: `0x${string}`;
  registry: `0x${string}`;
  tasker: `0x${string}`;
  limit?: number;
}): Promise<Decision[]> {
  const { escrow, registry, tasker, limit = 25 } = params;
  const all = await recentDecisions({ escrow, limit: 200 });
  const lower = tasker.toLowerCase();

  const mine: Decision[] = [];
  for (const d of all) {
    if (d.verdict === "settled") {
      if (d.tasker?.toLowerCase() === lower) mine.push(d);
      continue;
    }

    // Held: ask the registry who this wallet was sealed to.
    const owner = await withRetry(() =>
      publicClient.readContract({
        address: registry,
        abi: registryReads,
        functionName: "taskerFor",
        args: [BigInt(d.campaignId), d.wallet],
      }),
    ).catch(() => null);

    if (owner && String(owner).toLowerCase() === lower) mine.push(d);
    if (mine.length >= limit) break;
  }

  return mine.slice(0, limit);
}

export const escrowEvents = parseAbi([
  "event Settled(uint256 indexed campaignId, address indexed tasker, address indexed wallet, uint256 actionIndex, uint256 amount, uint256 fee, string reason)",
  "event Held(uint256 indexed campaignId, address indexed wallet, uint256 actionIndex, string reason)",
]);

/**
 * Arc's public RPC answers -32011 "request limit reached" rather than an HTTP 429, so
 * viem's own retry does not recognise it and gives up immediately.
 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      // Arc phrases this several ways — "request limit reached", "rate limit exceeded",
      // "Request exceeds defined limit" — and none of them is an HTTP 429, so viem's
      // own retry never fires. Match the family, not one string.
      const msg = String((err as Error)?.message ?? "").toLowerCase();
      const limited = msg.includes("limit");
      if (!limited || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 700 * 2 ** i));
    }
  }
  throw new Error("unreachable");
}

export interface Decision {
  verdict: "settled" | "held";
  campaignId: number;
  wallet: `0x${string}`;
  tasker?: `0x${string}`;
  actionIndex: number;
  amount?: string;
  reason: string;
  txHash: `0x${string}`;
  blockNumber: string;
}

/**
 * The falcon's decisions, newest first.
 *
 * `campaignId` narrows to one campaign; omit it for everything the agent has ever
 * decided. Held events are the point as much as settled ones, so both are returned in
 * one ordered list rather than the refusals being tucked away somewhere.
 */
/**
 * An index of the agent's decisions, durable when there is a database.
 *
 * Arc produces sub-second blocks, so an escrow's first settlements fall behind the head
 * by roughly 160,000 blocks a day. Reading that range is many windows of `eth_getLogs`
 * against a rate-limited RPC — fine on the morning a contract is deployed, minutes long
 * a fortnight later.
 *
 * The scan used to live only in module memory, which meant every serverless cold start
 * threw the work away and walked the chain again. Now each window is written to Postgres
 * as it is read, and how far the scan has reached is recorded beside it, so the walk
 * happens once ever rather than once per instance. Requests read rows; only blocks
 * produced since the last pass are fetched.
 *
 * Without `DATABASE_URL` the same structure runs in memory, so the demo still works with
 * no database — it just re-scans when the process restarts.
 */
const index: {
  rows: Decision[];
  seen: Set<string>;
  oldestScanned: bigint | null;
  newestScanned: bigint | null;
  running: boolean;
  complete: boolean;
  /** Which escrow the in-memory state belongs to; a redeploy resets it. */
  escrow: string | null;
  /** Whether persisted state has been read into this process yet. */
  hydrated: boolean;
} = {
  rows: [],
  seen: new Set(),
  oldestScanned: null,
  newestScanned: null,
  running: false,
  complete: false,
  escrow: null,
  hydrated: false,
};

/** Forget everything when the configured escrow changes under us. */
function resetFor(escrow: string) {
  if (index.escrow === escrow) return;
  index.rows = [];
  index.seen = new Set();
  index.oldestScanned = null;
  index.newestScanned = null;
  index.complete = false;
  index.hydrated = false;
  index.escrow = escrow;
}

/** Read the persisted scan position, once per process. */
async function hydrate(escrow: string) {
  if (index.hydrated) return;
  index.hydrated = true;
  if (!db) return;

  try {
    const [state] = await db
      .select()
      .from(schema.chainScan)
      .where(eq(schema.chainScan.escrow, escrow))
      .limit(1);
    if (!state) return;
    if (state.oldestScanned !== null) index.oldestScanned = BigInt(state.oldestScanned);
    if (state.newestScanned !== null) index.newestScanned = BigInt(state.newestScanned);
    index.complete = state.complete;
  } catch {
    // A missing table is not worth failing a page over — fall back to scanning.
  }
}

async function saveState(escrow: string) {
  if (!db) return;
  const row = {
    escrow,
    oldestScanned: index.oldestScanned === null ? null : Number(index.oldestScanned),
    newestScanned: index.newestScanned === null ? null : Number(index.newestScanned),
    complete: index.complete,
  };
  try {
    await db
      .insert(schema.chainScan)
      .values(row)
      .onConflictDoUpdate({ target: schema.chainScan.escrow, set: row });
  } catch {
    // Losing the bookmark costs a re-scan, never correctness.
  }
}

/** Write a window's decisions. The key is the dedupe, so overlap is free. */
async function persist(escrow: string, rows: Decision[]) {
  if (!db || rows.length === 0) return;
  try {
    await db
      .insert(schema.chainDecisions)
      .values(
        rows.map((d) => ({
          key: keyOf(d),
          escrow,
          verdict: d.verdict,
          campaignId: d.campaignId,
          wallet: d.wallet,
          tasker: d.tasker ?? "",
          actionIndex: d.actionIndex,
          amount: d.amount ?? "",
          reason: d.reason,
          txHash: d.txHash,
          blockNumber: Number(d.blockNumber),
        })),
      )
      .onConflictDoNothing({ target: schema.chainDecisions.key });
  } catch {
    // Same reasoning as saveState: the chain is the source of truth.
  }
}

/** Block to stop scanning back at — before this, the escrow did not exist. */
function floorBlock(): bigint {
  const raw = process.env.VANE_ESCROW_FROM_BLOCK;
  return raw && /^\d+$/.test(raw) ? BigInt(raw) : BigInt(0);
}

export function indexState() {
  return {
    indexed: index.rows.length,
    scanning: index.running,
    complete: index.complete,
    // Exposed so the backfill's progress is observable rather than a black box.
    oldestScanned: index.oldestScanned === null ? null : String(index.oldestScanned),
    newestScanned: index.newestScanned === null ? null : String(index.newestScanned),
    floor: String(floorBlock()),
    durable: Boolean(db),
  };
}

export async function recentDecisions(params: {
  escrow: `0x${string}`;
  campaignId?: bigint;
  limit?: number;
}): Promise<Decision[]> {
  const { escrow, campaignId, limit = 20 } = params;

  await scan(escrow);

  if (db) {
    try {
      const where =
        campaignId === undefined
          ? eq(schema.chainDecisions.escrow, escrow)
          : and(
              eq(schema.chainDecisions.escrow, escrow),
              eq(schema.chainDecisions.campaignId, Number(campaignId)),
            );

      const rows = await db
        .select()
        .from(schema.chainDecisions)
        .where(where)
        .orderBy(desc(schema.chainDecisions.blockNumber))
        .limit(limit);

      return rows.map((r) => ({
        verdict: r.verdict as Decision["verdict"],
        campaignId: r.campaignId,
        wallet: r.wallet as `0x${string}`,
        tasker: (r.tasker || undefined) as `0x${string}` | undefined,
        actionIndex: r.actionIndex,
        amount: r.amount || undefined,
        reason: r.reason,
        txHash: r.txHash as `0x${string}`,
        blockNumber: String(r.blockNumber),
      }));
    } catch {
      // Fall through to whatever this process has in memory.
    }
  }

  const out = index.rows.filter((r) => campaignId === undefined || BigInt(r.campaignId) === campaignId);
  out.sort((a, b) => Number(BigInt(b.blockNumber) - BigInt(a.blockNumber)));
  return out.slice(0, limit);
}

/** Arc caps `eth_getLogs` at 10,000 blocks, so every scan moves a window at a time. */
const WINDOW = BigInt(9_500);

async function readWindow(escrow: `0x${string}`, from: bigint, to: bigint): Promise<Decision[]> {
  /**
   * One request per window, not two.
   *
   * `getLogs` with `events` matches both signatures in a single `eth_getLogs`, where
   * `getContractEvents` needs a call per event name. Against a rate-limited RPC and a
   * backlog of ~58 windows that difference is the whole warm-up time.
   */
  const logs = await withRetry(() =>
    publicClient.getLogs({ address: escrow, events: escrowEvents, fromBlock: from, toBlock: to }),
  );

  const found: Decision[] = [];
  for (const l of logs) {
    const common = {
      campaignId: Number(l.args.campaignId),
      wallet: l.args.wallet as `0x${string}`,
      actionIndex: Number(l.args.actionIndex),
      reason: String(l.args.reason ?? ""),
      txHash: (l.transactionHash ?? "0x") as `0x${string}`,
      blockNumber: String(l.blockNumber ?? BigInt(0)),
    };

    if (l.eventName === "Settled") {
      found.push({
        ...common,
        verdict: "settled",
        tasker: l.args.tasker as `0x${string}`,
        amount: String(l.args.amount ?? BigInt(0)),
      });
    } else if (l.eventName === "Held") {
      found.push({ ...common, verdict: "held" });
    }
  }

  for (const d of found) add(d);
  await persist(escrow, found);
  return found;
}

/** Keyed so a re-scan of an overlapping window cannot duplicate a decision. */
function keyOf(d: Decision): string {
  return `${d.verdict}:${d.txHash}:${d.campaignId}:${d.wallet}:${d.actionIndex}`;
}

function add(d: Decision) {
  const key = keyOf(d);
  if (index.seen.has(key)) return;
  index.seen.add(key);
  index.rows.push(d);
}

/**
 * Catch up the index. Returns as soon as the head is current; the long backfill
 * continues in the background so the first request is not held for minutes.
 */
async function scan(escrow: `0x${string}`) {
  resetFor(escrow);
  await hydrate(escrow);

  const head = await withRetry(() => publicClient.getBlockNumber());

  // Forward catch-up: cheap, and keeps a live dashboard current.
  if (index.newestScanned !== null && head > index.newestScanned) {
    let from = index.newestScanned + BigInt(1);
    while (from <= head) {
      const to = from + WINDOW > head ? head : from + WINDOW;
      await readWindow(escrow, from, to);
      from = to + BigInt(1);
    }
    index.newestScanned = head;
    await saveState(escrow);
  }

  if (index.complete || index.running) return;

  index.running = true;
  if (index.newestScanned === null) index.newestScanned = head;
  if (index.oldestScanned === null) index.oldestScanned = head + BigInt(1);

  // Backfill backwards, newest first, so useful rows appear early. Each window is
  // persisted as it is read and the position saved with it, so an interrupted backfill
  // resumes where it stopped instead of starting over — including in a new instance.
  void (async () => {
    try {
      const floor = floorBlock();
      while (index.oldestScanned !== null && index.oldestScanned > floor) {
        const to = index.oldestScanned - BigInt(1);
        const from = to > floor + WINDOW ? to - WINDOW : floor;
        await readWindow(escrow, from, to);
        index.oldestScanned = from;
        await saveState(escrow);
        if (from <= floor) break;
        await new Promise((r) => setTimeout(r, 40));
      }
      index.complete = true;
      await saveState(escrow);
    } catch {
      // Leave it incomplete; the next request resumes from where it stopped.
    } finally {
      index.running = false;
    }
  })();
}
