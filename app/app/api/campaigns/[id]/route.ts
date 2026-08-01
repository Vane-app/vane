import { NextResponse } from "next/server";
import { getCampaign, takesForCampaign } from "../../../../lib/store";

/**
 * GET /api/campaigns/[id] — one campaign, with its live performance.
 *
 * The detail page used to look the campaign up in a bundled array and fall back to the
 * first entry when it missed — so a freshly posted campaign silently rendered a
 * different business's listing. Reading the store means a campaign posted a second ago
 * resolves, and an id that does not exist 404s instead of impersonating one that does.
 *
 * `promoters`, `results` and `totalPaid` are real. The descriptive copy — what counts,
 * the rules, how verification works — still comes from the bundled detail set on the
 * client, because a business has no way to write it yet.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const campaign = await getCampaign(Number(id));
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  const takes = await takesForCampaign(campaign.id);

  return NextResponse.json({
    campaign,
    performance: {
      promoters: takes.length,
      results: takes.reduce((n, t) => n + t.results, 0),
      clicks: takes.reduce((n, t) => n + t.clicks, 0),
      totalPaid: campaign.spent,
    },
  });
}
