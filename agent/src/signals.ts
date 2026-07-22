import { createPublicClient, http, erc20Abi } from "viem";
import { config, USDC_ADDRESS } from "./config.js";
import { registryAbi } from "./abi.js";
import type { TaskerSignals, WalletSignals } from "./decision.js";

/**
 * Reads the evidence the falcon judges on, straight from Arc.
 *
 * Everything here is a public on-chain fact. Nothing is self-reported by the
 * business or the tasker, which is what lets Tier 1 verification be trustless
 * for on-chain conversions.
 */

export const publicClient = createPublicClient({
  chain: config.chain,
  transport: http(config.rpcUrl),
});

/** Simple in-process cache — Arc is fast, but we still don't re-ask the same block twice. */
const sealCache = new Map<string, number>();

export async function walletSignals(
  campaignId: bigint,
  wallet: `0x${string}`,
  conversionBlock: bigint,
): Promise<WalletSignals> {
  if (!config.registryAddress) throw new Error("VANE_REGISTRY_ADDRESS is not set.");

  const cacheKey = `${campaignId}:${wallet}`;
  let sealed = sealCache.get(cacheKey);
  if (sealed === undefined) {
    const onChain = await publicClient.readContract({
      address: config.registryAddress,
      abi: registryAbi,
      functionName: "sealedAt",
      args: [campaignId, wallet],
    });
    sealed = Number(onChain);
    sealCache.set(cacheKey, sealed);
  }

  const [txCount, txCountNow, balance] = await Promise.all([
    publicClient.getTransactionCount({ address: wallet, blockNumber: conversionBlock }),
    publicClient.getTransactionCount({ address: wallet }),
    publicClient
      .readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [wallet] })
      .catch(() => 0n),
  ]);

  return {
    sealedAt: sealed,
    firstSeenAt: await firstSeenAt(wallet, sealed),
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
  const nonce = await publicClient.getTransactionCount({ address: wallet });
  return nonce === 0 ? sealedAt : 0;
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

/** All wallets a tasker sealed on a campaign — the input to cluster detection. */
export async function sealsForTasker(campaignId: bigint, tasker: `0x${string}`, fromBlock: bigint = 0n) {
  if (!config.registryAddress) throw new Error("VANE_REGISTRY_ADDRESS is not set.");
  const logs = await publicClient.getContractEvents({
    address: config.registryAddress,
    abi: registryAbi,
    eventName: "WalletSealed",
    args: { campaignId, tasker },
    fromBlock,
  });

  const seals = await Promise.all(
    logs.map(async (log) => {
      const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
      return {
        wallet: log.args.wallet as `0x${string}`,
        sealedAt: Number(block.timestamp),
      };
    }),
  );
  return seals;
}
