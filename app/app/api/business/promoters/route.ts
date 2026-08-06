import { NextResponse } from "next/server";
import { campaignsForOwner, takesForCampaign, getUser } from "../../../../lib/store";
import { currentUserId } from "../../../../lib/session";

/**
 * GET /api/business/promoters — who is actually promoting this business.
 *
 * A business paying per result wants to know who is earning it. The dashboard showed a
 * promoter *count* and nothing else, which is the least useful form of that number.
 *
 * Deliberately limited to what a business has a right to see about someone working for
 * them: a display name, their record on these campaigns, and what they have been paid.
 * Not their email, not their other campaigns, not their wallet balance. A marketplace
 * that leaks its workers' details to advertisers is not one people work on twice.
 */
export async function GET() {
  const uid = await currentUserId();
  if (!uid) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const campaigns = await campaignsForOwner(uid);
  const byCampaign = await Promise.all(campaigns.map((c) => takesForCampaign(c.id)));

  // One row per person, rolled up across every campaign they took from this business.
  const rolled = new Map<
    string,
    { userId: string; clicks: number; results: number; earned: number; campaigns: number; since: number }
  >();

  byCampaign.flat().forEach((t) => {
    const row = rolled.get(t.userId) ?? {
      userId: t.userId,
      clicks: 0,
      results: 0,
      earned: 0,
      campaigns: 0,
      since: t.takenAt,
    };
    row.clicks += t.clicks;
    row.results += t.results;
    row.earned += t.earned;
    row.campaigns += 1;
    row.since = Math.min(row.since, t.takenAt);
    rolled.set(t.userId, row);
  });

  const promoters = await Promise.all(
    [...rolled.values()].map(async (r) => {
      const u = await getUser(r.userId);
      const handle = u?.name || u?.email?.split("@")[0] || "Promoter";
      return {
        id: r.userId,
        name: handle,
        avatar: u?.avatar ?? "",
        reputation: u?.reputation ?? 80,
        clicks: r.clicks,
        results: r.results,
        earned: r.earned,
        campaigns: r.campaigns,
        since: r.since,
        // Only meaningful once there is traffic; the UI shows a dash below that.
        conversion: r.clicks > 0 ? Math.round((r.results / r.clicks) * 100) : null,
      };
    }),
  );

  promoters.sort((a, b) => b.earned - a.earned);
  return NextResponse.json({ promoters });
}
