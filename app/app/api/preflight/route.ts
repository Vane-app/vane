import { NextResponse } from "next/server";
import { publicClient, withRetry } from "../../../lib/chain";
import { parseAbi } from "viem";

/**
 * GET /api/preflight — is everything in place for a real run through the product?
 *
 * The loop has been proven by scripts but never once through the app, and it depends
 * on six things being simultaneously true. When it fails it fails late — a challenge
 * that never arrives, a transaction that reverts for want of gas — and at that point
 * it is hard to tell which of the six was missing.
 *
 * So: check them all up front, say which is wrong, and say what to do about it.
 */

const usdcAbi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const escrowAbi = parseAbi([
  "function nextCampaignId() view returns (uint256)",
  "function agent() view returns (address)",
]);
const USDC = "0x3600000000000000000000000000000000000000" as const;

interface Check {
  name: string;
  ok: boolean;
  detail: string;
  fix?: string;
}

export async function GET() {
  const checks: Check[] = [];
  const env = (k: string) => process.env[k];

  const need: [string, string][] = [
    ["CIRCLE_API_KEY", "Circle API key"],
    ["ENTITY_SECRET", "Circle entity secret"],
    ["CIRCLE_APP_ID", "Circle app id, for the browser PIN flow"],
    ["CIRCLE_WALLET_SET_ID", "Wallet set"],
    ["CIRCLE_AGENT_WALLET_ID", "The falcon's wallet"],
    ["VANE_ESCROW_ADDRESS", "Escrow contract"],
    ["VANE_REGISTRY_ADDRESS", "Referral registry"],
    ["DATABASE_URL", "Postgres — without it nothing survives a restart"],
  ];

  for (const [key, label] of need) {
    checks.push({
      name: label,
      ok: Boolean(env(key)),
      detail: env(key) ? "set" : `${key} is missing`,
      fix: env(key) ? undefined : `Add ${key} to .env`,
    });
  }

  const escrow = env("VANE_ESCROW_ADDRESS") as `0x${string}` | undefined;
  const agentAddress = env("VANE_AGENT_ADDRESS") as `0x${string}` | undefined;

  // The escrow has to answer, or nothing downstream can settle.
  if (escrow) {
    try {
      const next = await withRetry(() =>
        publicClient.readContract({ address: escrow, abi: escrowAbi, functionName: "nextCampaignId" }),
      );
      const onChainAgent = await withRetry(() =>
        publicClient.readContract({ address: escrow, abi: escrowAbi, functionName: "agent" }),
      );
      checks.push({
        name: "Escrow reachable on Arc",
        ok: true,
        detail: `next campaign id ${next}, agent ${String(onChainAgent).slice(0, 10)}…`,
      });
      checks.push({
        name: "The falcon is the escrow's agent",
        ok: Boolean(agentAddress) && String(onChainAgent).toLowerCase() === agentAddress?.toLowerCase(),
        detail:
          String(onChainAgent).toLowerCase() === agentAddress?.toLowerCase()
            ? "matches VANE_AGENT_ADDRESS"
            : `escrow expects ${onChainAgent}, env has ${agentAddress ?? "nothing"}`,
        fix: "Only this address can settle or hold. Redeploy or call setAgent.",
      });
    } catch (err) {
      checks.push({
        name: "Escrow reachable on Arc",
        ok: false,
        detail: (err as Error).message.slice(0, 120),
        fix: "Check ARC_RPC_URL and that the contract is deployed.",
      });
    }
  }

  // The falcon pays for settlement and for topping up new wallets.
  if (agentAddress) {
    const bal = (await withRetry(() =>
      publicClient.readContract({ address: USDC, abi: usdcAbi, functionName: "balanceOf", args: [agentAddress] }),
    ).catch(() => null)) as bigint | null;

    const usdc = bal === null ? 0 : Number(bal) / 1e6;
    checks.push({
      name: "The falcon has USDC",
      ok: usdc >= 2,
      detail: `$${usdc.toFixed(4)} — it pays for every settlement and tops up new wallets`,
      fix: usdc >= 2 ? undefined : `Fund ${agentAddress} at faucet.circle.com (Arc Testnet)`,
    });
  }

  const ok = checks.every((c) => c.ok);
  return NextResponse.json({
    ready: ok,
    summary: ok
      ? "Everything is in place. The only step left needs a human: set a PIN."
      : "Something is missing — see the checks below.",
    checks,
  });
}
