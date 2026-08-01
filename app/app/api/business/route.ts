import { NextResponse } from "next/server";
import { businessSummary, takesForCampaign } from "../../../lib/store";
import { currentUserId } from "../../../lib/session";

/**
 * GET /api/business — the signed-in business's own dashboard.
 *
 * Scoped to campaigns this account created, so a dashboard can never show somebody
 * else's budgets. A business that has posted nothing gets zeros and an empty list —
 * which is the honest answer, and the one the UI should render rather than inventing
 * a portfolio.
 */
export async function GET() {
  const uid = await currentUserId();
  if (!uid) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const s = await businessSummary(uid);

  const campaigns = await Promise.all(
    s.campaigns.map(async (c) => {
      const takes = await takesForCampaign(c.id);
    return {
      id: c.id,
      business: c.business,
      initial: c.initial,
      colour: c.colour,
      blurb: c.blurb,
      status: c.status,
      budget: c.budget,
      spent: c.spent,
      rewardPerAction: c.rewardPerAction,
      endsAt: c.endsAt,
      taskType: c.taskType,
      escrowCampaignId: c.escrowCampaignId ?? null,
      promoters: takes.length,
      results: takes.reduce((n, t) => n + t.results, 0),
      clicks: takes.reduce((n, t) => n + t.clicks, 0),
      };
    }),
  );

  return NextResponse.json({
    locked: s.locked,
    spent: s.spent,
    remaining: s.locked - s.spent,
    results: s.results,
    clicks: s.clicks,
    promoters: s.promoters,
    campaigns,
  });
}
