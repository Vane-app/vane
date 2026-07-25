import { NextResponse } from "next/server";
import { takeCampaign, getCampaign, getUser } from "../../../../../lib/store";
import { currentUserId } from "../../../../../lib/session";

/**
 * POST /api/campaigns/[id]/take — a tasker takes a campaign.
 *
 * Creates the take, and in the full flow seals the referral code into the
 * ReferralRegistry contract so attribution is onchain and permanent. Returns the
 * promoter's referral link.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await currentUserId();
  if (!uid || !getUser(uid)) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { id } = await ctx.params;
  const campaignId = Number(id);
  const campaign = getCampaign(campaignId);
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  const take = takeCampaign(uid, campaignId);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://vane.money";
  const link = `${base.replace(/^https?:\/\//, "")}/r/${take.refCode}`;

  return NextResponse.json({
    take: { id: take.id, refCode: take.refCode, results: take.results, earned: take.earned },
    link,
  });
}
