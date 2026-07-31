import { NextResponse } from "next/server";
import { listCampaigns, takesForCampaign } from "../../../../lib/store";
import { slugFor } from "../../../../lib/data";

/**
 * GET /api/business/[slug] — a business's public profile.
 *
 * Derived from the campaigns that business has actually run, rather than a seeded
 * profile record. A promoter reads this to decide whether to trust a campaign, so the
 * settlement record has to be the real one: what has been funded, what has been paid
 * out, and what is open right now.
 *
 * Works for a business that signed up five minutes ago and has one campaign — it will
 * simply say so, which is more use than an invented history.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;

  const campaigns = listCampaigns().filter((c) => slugFor(c.business) === slug);
  if (campaigns.length === 0) {
    return NextResponse.json({ error: "No such business." }, { status: 404 });
  }

  const first = campaigns[0];
  const takes = campaigns.flatMap((c) => takesForCampaign(c.id));

  return NextResponse.json({
    name: first.business,
    slug,
    initial: first.initial,
    colour: first.colour,
    blurb: first.blurb,
    bonded: campaigns.some((c) => c.bonded),
    kind: first.web3 ? "web3" : "web2",
    totalFunded: campaigns.reduce((s, c) => s + c.budget, 0),
    totalPaid: campaigns.reduce((s, c) => s + c.spent, 0),
    results: takes.reduce((s, t) => s + t.results, 0),
    promoters: new Set(takes.map((t) => t.userId)).size,
    campaigns: campaigns.map((c) => ({
      id: c.id,
      business: c.business,
      initial: c.initial,
      colour: c.colour,
      blurb: c.blurb,
      rewardPerAction: c.rewardPerAction,
      budget: c.budget,
      spent: c.spent,
      endsAt: c.endsAt,
      status: c.status,
      streaming: c.streaming,
      rateLabel: c.rateLabel,
      kind: c.kind,
      taskType: c.taskType,
    })),
  });
}
