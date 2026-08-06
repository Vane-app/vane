import { NextResponse } from "next/server";
import { businessSummary, takesForCampaign } from "../../../lib/store";
import { currentUserId } from "../../../lib/session";

/**
 * GET /api/business — the signed-in business's own dashboard.
 *
 * Scoped to campaigns this account created, so a dashboard can never show somebody
 * else's budgets. A business that has posted nothing gets zeros and an empty list —
 * the honest answer, and the one the UI should render rather than inventing a
 * portfolio.
 *
 * Each campaign carries what a business actually judges it on: what is left, how many
 * more results that buys, how long it has, and what each result has cost. Totals alone
 * tell you a campaign exists, not whether it is working.
 */
export async function GET() {
  const uid = await currentUserId();
  if (!uid) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const s = await businessSummary(uid);
  const now = Math.floor(Date.now() / 1000);

  const campaigns = await Promise.all(
    s.campaigns.map(async (c) => {
      const takes = await takesForCampaign(c.id);
      const results = takes.reduce((n, t) => n + t.results, 0);
      const clicks = takes.reduce((n, t) => n + t.clicks, 0);
      const remaining = Math.max(0, c.budget - c.spent);

      return {
        id: c.id,
        business: c.business,
        initial: c.initial,
        colour: c.colour,
        logoUrl: c.logoUrl ?? null,
        blurb: c.blurb,
        status: c.status,
        budget: c.budget,
        spent: c.spent,
        remaining,
        rewardPerAction: c.rewardPerAction,
        rateLabel: c.rateLabel ?? null,
        endsAt: c.endsAt,
        taskType: c.taskType,
        escrowCampaignId: c.escrowCampaignId ?? null,
        promoters: takes.length,
        results,
        clicks,
        /** How many more results the remaining budget can pay for. */
        resultsLeft: c.rewardPerAction > 0 ? Math.floor(remaining / c.rewardPerAction) : 0,
        daysLeft: Math.max(0, Math.ceil((c.endsAt - now) / 86_400)),
        /** Null until there is traffic — a rate from zero clicks is noise. */
        conversion: clicks > 0 ? Math.round((results / clicks) * 100) : null,
      };
    }),
  );

  // Newest first, but anything still running outranks anything closed.
  const rank = (st: string) => (st === "active" ? 0 : st === "paused" ? 1 : 2);
  campaigns.sort((a, b) => rank(a.status) - rank(b.status) || b.id - a.id);

  return NextResponse.json({
    locked: s.locked,
    spent: s.spent,
    remaining: s.locked - s.spent,
    results: s.results,
    clicks: s.clicks,
    promoters: s.promoters,
    /** What the business has actually paid per verified result, across everything. */
    costPerResult: s.results > 0 ? Math.round(s.spent / s.results) : null,
    campaigns,
  });
}
