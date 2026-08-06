import { NextResponse } from "next/server";
import { earningsFor, getCampaign } from "../../../lib/store";
import { currentUserId } from "../../../lib/session";

/**
 * GET /api/earnings — the signed-in tasker's balance, links and performance.
 *
 * The referral link is included because it is the thing a promoter comes back for.
 * It previously existed only on the campaign page they took it from, so anyone who
 * navigated away had no way to find their own link again.
 */
export async function GET() {
  const uid = await currentUserId();
  if (!uid) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://vane.money").replace(/^https?:\/\//, "");
  const e = await earningsFor(uid);

  const streams = await Promise.all(
    e.takes.map(async (t) => {
      const c = await getCampaign(t.campaignId);
      return {
        takeId: t.id,
        refCode: t.refCode,
        link: `${base}/r/${t.refCode}`,
        campaignId: t.campaignId,
        business: c?.business ?? "Campaign",
        initial: c?.initial ?? "?",
        colour: c?.colour ?? "#3e6b8f",
        logoUrl: c?.logoUrl ?? null,
        rewardPerAction: c?.rewardPerAction ?? 0,
        rateLabel: c?.rateLabel ?? null,
        clicks: t.clicks,
        results: t.results,
        earned: t.earned,
        takenAt: t.takenAt,
        // A promoter needs to know when a campaign they are working has been paused
        // or has run out of budget — otherwise they keep sharing a link that cannot
        // pay, which is the fastest way to lose someone from a marketplace.
        status: c?.status ?? "active",
        live: (c?.status ?? "active") === "active",
        budgetLeft: c ? Math.max(0, c.budget - c.spent) : 0,
        resultsLeft: c && c.rewardPerAction > 0 ? Math.floor(Math.max(0, c.budget - c.spent) / c.rewardPerAction) : 0,
        daysLeft: c ? Math.max(0, Math.ceil((c.endsAt - Math.floor(Date.now() / 1000)) / 86_400)) : 0,
      };
    }),
  );

  return NextResponse.json({
    available: e.available,
    results: e.results,
    clicks: e.clicks,
    streams,
  });
}
