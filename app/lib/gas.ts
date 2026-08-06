import { randomUUID } from "node:crypto";
import { publicClient, withRetry } from "./chain";
import { parseAbi } from "viem";

/**
 * The falcon covers a new wallet's first transactions.
 *
 * On Arc, gas is USDC. A wallet created seconds ago holds none — so the very first
 * thing a new user tries to do fails, whether that is a tasker claiming a referral
 * code or a business approving its escrow. Onboarding would end with "your wallet is
 * ready" and then nothing would work.
 *
 * So the agent sends a small float on first sight of a wallet. This is Vane's own
 * money, not anyone else's, and it is the honest version of a gasless experience for
 * an EOA — Circle Paymaster can sponsor gas, but only for SCA wallets, and user
 * wallets are EOA so Gateway stays open to us.
 *
 * Deliberately narrow: a fixed small amount, only to a wallet that has none, at most
 * once per address per process. It cannot be turned into a faucet by refreshing.
 */

const TOP_UP = "0.40"; // enough for a claim, an approve and a settle on Arc
const FLOOR = BigInt(150_000); // 0.15 USDC — below this a wallet cannot transact

const usdcAbi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const USDC = "0x3600000000000000000000000000000000000000" as const;

/** Addresses already topped up, so a page refresh cannot drain the agent. */
const g = globalThis as unknown as { __vaneToppedUp?: Set<string> };
const seen = () => (g.__vaneToppedUp ??= new Set<string>());

export interface TopUpResult {
  funded: boolean;
  reason: "already-funded" | "sent" | "not-configured" | "agent-empty" | "failed" | "already-tried";
  txHash?: string;
}

export async function topUpForGas(address: string): Promise<TopUpResult> {
  const key = address.toLowerCase();
  if (seen().has(key)) return { funded: false, reason: "already-tried" };

  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.ENTITY_SECRET;
  const agentWalletId = process.env.CIRCLE_AGENT_WALLET_ID;
  if (!apiKey || !entitySecret || !agentWalletId) return { funded: false, reason: "not-configured" };

  // Already has gas? Then this is not a new wallet and nothing is owed.
  const balance = (await withRetry(() =>
    publicClient.readContract({
      address: USDC,
      abi: usdcAbi,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    }),
  ).catch(() => null)) as bigint | null;

  if (balance !== null && balance >= FLOOR) return { funded: false, reason: "already-funded" };

  seen().add(key);

  try {
    const { initiateDeveloperControlledWalletsClient } = await import("@circle-fin/developer-controlled-wallets");
    const circle = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

    const balances = await circle.getWalletTokenBalance({ id: agentWalletId });
    const token = balances.data?.tokenBalances?.find(
      (b) => b.token?.tokenAddress?.toLowerCase() === USDC.toLowerCase() || b.token?.symbol === "USDC",
    );
    if (!token?.token?.id) return { funded: false, reason: "agent-empty" };
    if (Number(token.amount ?? 0) < Number(TOP_UP)) return { funded: false, reason: "agent-empty" };

    const res = await circle.createTransaction({
      walletId: agentWalletId,
      tokenId: token.token.id,
      destinationAddress: address,
      amount: [TOP_UP],
      // Keyed on the address so a retry cannot send twice.
      idempotencyKey: uuidFor(key),
      fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    });

    return { funded: true, reason: "sent", txHash: res.data?.id };
  } catch (err) {
    // A failed top-up must not break onboarding — the wallet still exists, and the
    // user can be funded from the faucet instead.
    console.error("[vane] gas top-up failed:", (err as Error).message);
    seen().delete(key);
    return { funded: false, reason: "failed" };
  }
}

/** A stable UUID per address, so Circle rejects a duplicate rather than paying twice. */
function uuidFor(key: string): string {
  let h = 0x811c9dc5;
  const bytes: number[] = [];
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
    bytes.push(h & 0xff, (h >> 8) & 0xff);
  }
  while (bytes.length < 16) bytes.push((bytes.length * 31 + 7) & 0xff);
  const hex = bytes
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export { randomUUID };
