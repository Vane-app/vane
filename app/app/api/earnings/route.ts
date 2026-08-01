import { NextResponse } from "next/server";
import { earningsFor, getCampaign } from "../../../lib/store";
import { currentUserId } from "../../../lib/session";

/** GET /api/earnings — the signed-in tasker's balance, streams and performance. */
export async function GET() {
  const uid = await currentUserId();
  if (!uid) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const e = await earningsFor(uid);
  const streams = await Promise.all(
    e.takes.map(async (t) => {
      const c = await getCampaign(t.campaignId);
    return {
      campaignId: t.campaignId,
      business: c?.business ?? "Campaign",
      initial: c?.initial ?? "?",
      colour: c?.colour ?? "#3e6b8f",
      clicks: t.clicks,
      results: t.results,
      earned: t.earned,
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
