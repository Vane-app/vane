import { NextResponse } from "next/server";
import { recordClick, findTakeByCode, getCampaign } from "../../../lib/store";

/**
 * GET /r/[code] — a promoter's referral link.
 *
 * Records the click (attribution), sets a cookie so a later conversion can be
 * traced back, and redirects the visitor onward. In the full flow this is where
 * the referral is sealed onchain the first time a referred wallet appears.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const take = await recordClick(code);

  const found = await findTakeByCode(code);
  const campaign = found ? await getCampaign(found.campaignId) : undefined;

  // In production this redirects to the business's own site with the ref tagged.
  // Here we send them to the campaign so the flow is visible end to end.
  const dest = campaign ? `/campaign/${campaign.id}?ref=${code}` : "/tasks";

  const res = NextResponse.redirect(new URL(dest, process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001"));
  if (take) {
    res.cookies.set("vane_ref", code, { maxAge: 60 * 60 * 24 * 90, path: "/", sameSite: "lax" });
  }
  return res;
}
