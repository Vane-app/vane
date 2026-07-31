import { NextResponse } from "next/server";
import { recentDecisions, indexState, EXPLORER } from "../../../lib/chain";

/**
 * GET /api/decisions — what the falcon has actually decided, from Arc.
 *
 * Public on purpose. The refusals are the strongest trust signal an advertiser gets,
 * and the whole argument is "audit the agent rather than trust it" — which only works
 * if the decisions are readable without an account. Every row carries the transaction
 * that recorded it, so nothing here has to be taken on our word.
 *
 * `?campaign=<id>` narrows to one campaign.
 */
export async function GET(req: Request) {
  const escrow = process.env.VANE_ESCROW_ADDRESS as `0x${string}` | undefined;
  if (!escrow) {
    return NextResponse.json({ configured: false, decisions: [] });
  }

  const url = new URL(req.url);
  const raw = url.searchParams.get("campaign");
  const campaignId = raw && /^\d+$/.test(raw) ? BigInt(raw) : undefined;

  try {
    const decisions = await recentDecisions({ escrow, campaignId, limit: 20 });
    return NextResponse.json({
      configured: true,
      escrow,
      explorer: EXPLORER,
      settled: decisions.filter((d) => d.verdict === "settled").length,
      held: decisions.filter((d) => d.verdict === "held").length,
      // So the UI can say "still reading the chain" rather than "no decisions" while
      // the first backfill is running.
      ...indexState(),
      decisions,
    });
  } catch (err) {
    // A busy RPC must not take the dashboard down with it.
    return NextResponse.json(
      { configured: true, decisions: [], error: (err as Error).message },
      { status: 200 },
    );
  }
}
