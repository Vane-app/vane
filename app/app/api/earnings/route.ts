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
        rewardPerAction: c?.rewardPerAction ?? 0,
        rateLabel: c?.rateLabel ?? null,
        clicks: t.clicks,
        results: t.results,
        earned: t.earned,
        takenAt: t.takenAt,
        live: (c?.status ?? "active") === "active",
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
