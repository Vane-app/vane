import { NextResponse } from "next/server";
import { getUser } from "../../../../lib/store";
import { currentUserId } from "../../../../lib/session";
import { decisionsForTasker, EXPLORER } from "../../../../lib/chain";

/**
 * GET /api/me/decisions — what the falcon decided about my work.
 *
 * The business dashboard shows refusals because an advertiser fears paying for fraud.
 * The person who lost the payout has the stronger claim to the same information, and
 * had no way to see it: their work could be held with a written reason on a public
 * chain, and the app would tell them nothing.
 *
 * Every row is the agent's own sentence, with the transaction that recorded it — so a
 * tasker who disagrees can point at something rather than argue with a balance.
 */
export async function GET() {
  const uid = await currentUserId();
  if (!uid) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const user = await getUser(uid);
  const escrow = process.env.VANE_ESCROW_ADDRESS as `0x${string}` | undefined;
  const registry = process.env.VANE_REGISTRY_ADDRESS as `0x${string}` | undefined;

  // No wallet yet means no work has been attributed, which is not an error state.
  if (!user?.walletAddress || !escrow || !registry) {
    return NextResponse.json({ decisions: [], settled: 0, held: 0, explorer: EXPLORER });
  }

  try {
    const decisions = await decisionsForTasker({
      escrow,
      registry,
      tasker: user.walletAddress as `0x${string}`,
      limit: 25,
    });

    return NextResponse.json({
      decisions,
      settled: decisions.filter((d) => d.verdict === "settled").length,
      held: decisions.filter((d) => d.verdict === "held").length,
      explorer: EXPLORER,
    });
  } catch (err) {
    // A busy RPC must not take the earnings page down with it.
    return NextResponse.json({ decisions: [], settled: 0, held: 0, explorer: EXPLORER, error: (err as Error).message });
  }
}
