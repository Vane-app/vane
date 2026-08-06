import { NextResponse } from "next/server";
import { parseAbi } from "viem";
import { getUser } from "../../../../lib/store";
import { currentUserId } from "../../../../lib/session";
import { publicClient, withRetry } from "../../../../lib/chain";

/**
 * GET /api/wallet/balance — what is actually in the signed-in user's wallet.
 *
 * Read straight off Arc rather than from anything we store, because a balance we
 * cached could be wrong the moment a settlement lands.
 *
 * It matters more than a balance usually does: gas on Arc is USDC, so an empty wallet
 * cannot do anything at all. A business seeing zero here learns it cannot fund a
 * campaign before it starts filling one in, rather than halfway through signing.
 */

const USDC = "0x3600000000000000000000000000000000000000" as const;
const usdcAbi = parseAbi(["function balanceOf(address) view returns (uint256)"]);

export async function GET() {
  const uid = await currentUserId();
  if (!uid) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const user = await getUser(uid);
  if (!user?.walletAddress) return NextResponse.json({ usdc: null, address: null });

  try {
    const raw = (await withRetry(() =>
      publicClient.readContract({
        address: USDC,
        abi: usdcAbi,
        functionName: "balanceOf",
        args: [user.walletAddress as `0x${string}`],
      }),
    )) as bigint;

    return NextResponse.json({
      address: user.walletAddress,
      // The 6-decimal view, the same one the contracts and every figure in the app use.
      usdc: Number(raw) / 1e6,
    });
  } catch {
    // A busy RPC is not a zero balance, and must never be shown as one.
    return NextResponse.json({ address: user.walletAddress, usdc: null });
  }
}
