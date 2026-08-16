import { createPublicClient, http, erc20Abi, type PublicClient } from "viem";
import { config, USDC_ADDRESS } from "./config.js";
import { registryAbi, escrowAbi } from "./abi.js";
import type { TaskerSignals, WalletSignals } from "./decision.js";

/**
 * Reads the evidence the falcon judges on, straight from Arc.
 *
 * Everything here is a public on-chain fact. Nothing is self-reported by the
 * business or the tasker, which is what lets Tier 1 verification be trustless
 * for on-chain conversions.
 */

// Annotated rather than inferred: viem's inferred client type cannot be named
// without reaching into its internals, which blocks declaration emit — and the
// app needs those declarations to import the falcon's judgement.
export const publicClient: PublicClient = createPublicClient({
  chain: config.chain,
  transport: http(config.rpcUrl),
});

/**
 * Arc's public RPC rate-limits by answering -32011 "request limit reached" rather than
 * an HTTP 429, so viem's built-in retry does not recognise it and gives up immediately.
 * Every read the falcon makes goes through here: a verification that fails because the
 * RPC was busy must never be mistaken for a verification that failed on the evidence.
 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const limited = String((err as Error)?.message ?? "").includes("request limit");
      if (!limited || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 800 * 2 ** i));
    }
  }
  throw new Error("unreachable");
}

/** Simple in-process cache — Arc is fast, but we still don't re-ask the same block twice. */
const sealCache = new Map<string, number>();

/** Arc caps `eth_getLogs` at 10,000 blocks, and sub-second blocks make that ~2 hours. */
const LOG_WINDOW = 9_000n;

/**
 * How far back a signal scan is willing to walk.
 *
 * Arc's first escrow settlements already sit hundreds of thousands of blocks behind the
 * head, so "scan from block 0" is not a range — it is a hundred rate-limited requests
 * inside a settlement pass somebody is waiting on. Set `VANE_FROM_BLOCK` to the
 * deployment block and the whole history is in range; without it, the scan is bounded
 * and the counts it produces describe recent history rather than all time.
 */
function floorBlock(): bigint {
  const raw = process.env.VANE_FROM_BLOCK ?? process.env.VANE_ESCROW_FROM_BLOCK;
  return raw && /^\d+$/.test(raw) ? BigInt(raw) : 0n;
}

const MAX_WINDOWS = 12;

/**
 * Read logs in windows the RPC will actually accept, newest first.
 *
 * `getContractEvents({ fromBlock: 0n })` looked like it read all history. Against Arc it
 * exceeds the range cap and throws — and every caller here wrapped that in a catch that
 * returned an empty array, so a scan that failed was indistinguishable from a tasker
 * with no referrals at all. Every fraud signal derived from these logs quietly read zero.
 */
async function scanLogs<T>(
  read: (from: bigint, to: bigint) => Promise<T[]>,
  maxWindows = MAX_WINDOWS,
): Promise<T[]> {
  const head = await withRetry(() => publicClient.getBlockNumber());
  const floor = floorBlock();
  const out: T[] = [];

  let to = head;
  for (let i = 0; i < maxWindows && to > floor; i++) {
    const from = to > floor + LOG_WINDOW ? to - LOG_WINDOW : floor;
    out.push(...(await read(from, to)));
    if (from <= floor) break;
    to = from - 1n;
  }
  return out;
}

/** Block timestamps, cached — a batch of seals usually shares a handful of blocks. */
const blockTimeCache = new Map<string, number>();

async function blockTime(blockNumber: bigint): Promise<number> {
  const key = blockNumber.toString();
  const hit = blockTimeCache.get(key);
  if (hit !== undefined) return hit;
  const block = await withRetry(() => publicClient.getBlock({ blockNumber }));
  const at = Number(block.timestamp);
  blockTimeCache.set(key, at);
  return at;
}

/**
 * Who holds a referral code, across both shapes of the registry.
 *
 * Code ownership used to be a global `bytes32 => address`, which let a code claimed under
 * one campaign overwrite its owner for every other. The fix scopes it to the campaign, so
 * the getter takes two arguments — but the registry already deployed on Arc still has the
 * one-argument form. Try the scoped signature, fall back to the legacy one, so the demo
 * scripts run against either.
 */
export async function readTaskerOfCode(
  registry: `0x${string}`,
  campaignId: bigint,
  code: `0x${string}`,
): Promise<string> {
  const scoped = [
    {
      type: "function",
      name: "taskerOfCode",
      stateMutability: "view",
      inputs: [{ type: "uint256" }, { type: "bytes32" }],
      outputs: [{ type: "address" }],
    },
  ] as const;

  const legacy = [
    {
      type: "function",
      name: "taskerOfCode",
      stateMutability: "view",
      inputs: [{ type: "bytes32" }],
      outputs: [{ type: "address" }],
    },
  ] as const;

  try {
    return String(
      await withRetry(() =>
        publicClient.readContract({
          address: registry,
          abi: scoped,
          functionName: "taskerOfCode",
          args: [campaignId, code],
        }),
      ),
    );
  } catch {
    return String(
      await withRetry(() =>
        publicClient.readContract({
          address: registry,
          abi: legacy,
          functionName: "taskerOfCode",
          args: [code],
        }),
      ),
    );
  }
}

export async function walletSignals(
  campaignId: bigint,
  wallet: `0x${string}`,
  conversionBlock: bigint,
): Promise<WalletSignals> {
  if (!config.registryAddress) throw new Error("VANE_REGISTRY_ADDRESS is not set.");

  const cacheKey = `${campaignId}:${wallet}`;
  let sealed = sealCache.get(cacheKey);
  if (sealed === undefined) {
    const onChain = await withRetry(() =>
      publicClient.readContract({
        address: config.registryAddress as `0x${string}`,
        abi: registryAbi,
        functionName: "sealedAt",
        args: [campaignId, wallet],
      }),
    );
    sealed = Number(onChain);
    sealCache.set(cacheKey, sealed);
  }

  // Sequential rather than Promise.all: three simultaneous reads per wallet is exactly
  // what trips the public RPC's limiter when judging a batch.
  const txCount = await withRetry(() =>
    publicClient.getTransactionCount({ address: wallet, blockNumber: conversionBlock }),
  );
  const txCountNow = await withRetry(() => publicClient.getTransactionCount({ address: wallet }));
  const balance = await withRetry(() =>
    publicClient.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }),
  ).catch(() => 0n);

  return {
    sealedAt: sealed,
    firstSeenAt: await firstSeenAt(wallet, sealed),
    fundedBy: await firstFunder(wallet),
    txCount,
    txCountAfterConversion: Math.max(0, txCountNow - txCount),
    usdcBalance: balance as bigint,
  };
}

/**
 * Approximate first-seen using nonce: a wallet with nonce 0 at conversion time has
 * never sent a transaction, so its on-chain life effectively began at the seal.
 * A full implementation indexes first-inbound-transfer; this is the honest
 * approximation an MVP can make from RPC alone.
 */
async function firstSeenAt(wallet: `0x${string}`, sealedAt: number): Promise<number> {
  const nonce = await withRetry(() => publicClient.getTransactionCount({ address: wallet }));
  return nonce === 0 ? sealedAt : 0;
}

/**
 * Who paid for this wallet to exist.
 *
 * Screening the converting address is close to meaningless on its own here: Vane creates
 * a wallet for each person, so the address is minutes old and has no history for any
 * registry to have an opinion about. It comes back clean because it is new, not because
 * anyone checked anything.
 *
 * The money had to come from somewhere, though, and that address is not new. A fresh
 * wallet funded out of a sanctioned one is the case this exists to catch, and it is
 * invisible if you only ever look at the wallet in front of you.
 *
 * Earliest inbound USDC transfer within the scan range. Fresh wallets are funded shortly
 * before they convert, so the window that already bounds every other read reaches it.
 */
export async function firstFunder(wallet: `0x${string}`): Promise<`0x${string}` | undefined> {
  const logs = await scanLogs((fromBlock, toBlock) =>
    withRetry(() =>
      publicClient.getLogs({
        address: USDC_ADDRESS,
        event: transferEvent,
        args: { to: wallet },
        fromBlock,
        toBlock,
      }),
    ),
  ).catch(() => []);

  if (logs.length === 0) return undefined;

  // scanLogs walks newest-first, so the funding transfer is the last one it reaches.
  let earliest = logs[0];
  for (const l of logs) {
    if ((l.blockNumber ?? 0n) < (earliest.blockNumber ?? 0n)) earliest = l;
  }

  const from = (earliest.args as { from?: string }).from;
  return from ? (from as `0x${string}`) : undefined;
}

/** Aggregate a tasker's behaviour across the campaign from settlement history. */
export async function taskerSignals(
  campaignId: bigint,
  tasker: `0x${string}`,
  history: { settled: number; held: number; lastHour: number; referred: number; funders: number },
): Promise<TaskerSignals> {
  return {
    address: tasker,
    settledCount: history.settled,
    heldCount: history.held,
    lastHourCount: history.lastHour,
    distinctFunders: history.funders,
    referredCount: history.referred,
  };
}

export interface Seal {
  wallet: `0x${string}`;
  sealedAt: number;
}

/** All wallets a tasker sealed on a campaign — the input to cluster detection. */
export async function sealsForTasker(campaignId: bigint, tasker: `0x${string}`): Promise<Seal[]> {
  if (!config.registryAddress) throw new Error("VANE_REGISTRY_ADDRESS is not set.");
  const registry = config.registryAddress;

  const logs = await scanLogs((fromBlock, toBlock) =>
    withRetry(() =>
      publicClient.getContractEvents({
        address: registry,
        abi: registryAbi,
        eventName: "WalletSealed",
        args: { campaignId, tasker },
        fromBlock,
        toBlock,
      }),
    ),
  );

  const seals: Seal[] = [];
  for (const log of logs) {
    seals.push({
      wallet: log.args.wallet as `0x${string}`,
      sealedAt: await blockTime(log.blockNumber),
    });
  }
  return seals;
}

/**
 * What this tasker's past claims were judged to be, read back off the escrow.
 *
 * The daemon accumulated this in memory as it watched. A cron wakes with no memory, and
 * passing zeroes meant every tasker looked brand new forever — so the reputation signal,
 * in both directions, never fired in the deployed settler.
 *
 * `Settled` indexes the tasker, so those filter server-side. `Held` only records the
 * converting wallet, so refusals are matched against the wallets this tasker sealed —
 * which the caller already has, making it free rather than a lookup per event.
 */
export async function taskerRecord(
  campaignId: bigint,
  tasker: `0x${string}`,
  sealedWallets: `0x${string}`[],
): Promise<{ settled: number; held: number }> {
  if (!config.escrowAddress) return { settled: 0, held: 0 };
  const escrow = config.escrowAddress;

  const settledLogs = await scanLogs((fromBlock, toBlock) =>
    withRetry(() =>
      publicClient.getContractEvents({
        address: escrow,
        abi: escrowAbi,
        eventName: "Settled",
        args: { tasker },
        fromBlock,
        toBlock,
      }),
    ),
  ).catch(() => []);

  const mine = new Set(sealedWallets.map((w) => w.toLowerCase()));
  const heldLogs = mine.size
    ? await scanLogs((fromBlock, toBlock) =>
        withRetry(() =>
          publicClient.getContractEvents({
            address: escrow,
            abi: escrowAbi,
            eventName: "Held",
            args: { campaignId },
            fromBlock,
            toBlock,
          }),
        ),
      ).catch(() => [])
    : [];

  const held = heldLogs.filter((l) =>
    mine.has(String((l.args as { wallet?: string }).wallet ?? "").toLowerCase()),
  ).length;

  return { settled: settledLogs.length, held };
}

const transferEvent = {
  type: "event",
  name: "Transfer",
  inputs: [
    { name: "from", type: "address", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "value", type: "uint256", indexed: false },
  ],
} as const;

/**
 * How many distinct addresses funded this tasker's referred wallets.
 *
 * The tell a sybil farm cannot hide: twenty "customers" whose USDC all came out of one
 * purse. The deployed settler was passing `max(1, referred)` here, which makes the
 * concentration ratio exactly 1.0 — permanently above the threshold, so the check could
 * never fire no matter what the funding actually looked like.
 *
 * One `eth_getLogs` per window for the whole set, since `to` is an indexed parameter and
 * viem will match an array of them.
 */
export async function distinctFunders(wallets: `0x${string}`[]): Promise<number> {
  if (wallets.length === 0) return 0;

  const logs = await scanLogs((fromBlock, toBlock) =>
    withRetry(() =>
      publicClient.getLogs({
        address: USDC_ADDRESS,
        event: transferEvent,
        args: { to: wallets },
        fromBlock,
        toBlock,
      }),
    ),
  ).catch(() => []);

  const funders = new Set<string>();
  for (const log of logs) {
    const from = String((log.args as { from?: string }).from ?? "").toLowerCase();
    if (from) funders.add(from);
  }
  return funders.size;
}
