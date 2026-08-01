import { NextResponse } from "next/server";
import { getCampaign, updateCampaign, getUser } from "../../../../../lib/store";
import { currentUserId } from "../../../../../lib/session";
import { escrowCampaign, nextEscrowCampaignId } from "../../../../../lib/chain";

/**
 * POST /api/campaigns/[id]/confirm — check the funding actually landed.
 *
 * Called after the business approves both challenges. The id was predicted before they
 * signed, and a prediction is not a fact: another business funding in the same instant
 * would have taken it. This re-reads the escrow and only marks the campaign funded if
 * the chain agrees the budget is really locked.
 *
 * Until this passes, the campaign is a listing with no escrow behind it, and the app
 * says so rather than implying money is locked when it is not.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await currentUserId();
  if (!uid || !await getUser(uid)) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { id } = await ctx.params;
  const campaign = await getCampaign(Number(id));
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  const escrow = process.env.VANE_ESCROW_ADDRESS as `0x${string}` | undefined;
  if (!escrow) return NextResponse.json({ funded: false, reason: "No escrow configured." });

  const candidates: number[] = [];
  if (campaign.escrowCampaignId) candidates.push(campaign.escrowCampaignId);

  // If the prediction was taken by someone else, the real one is the id just before
  // whatever `nextCampaignId` now reads.
  const next = await nextEscrowCampaignId(escrow).catch(() => null);
  if (next && next - 1 > 0 && !candidates.includes(next - 1)) candidates.push(next - 1);

  for (const candidate of candidates) {
    const onChain = await escrowCampaign(escrow, BigInt(candidate)).catch(() => null);
    if (!onChain?.funded) continue;
    if (String(onChain.budget) !== String(campaign.budget)) continue;

    await updateCampaign(campaign.id, { escrowCampaignId: candidate });
    return NextResponse.json({
      funded: true,
      escrowCampaignId: candidate,
      budget: onChain.budget,
      rewardPerAction: onChain.rewardPerAction,
    });
  }

  return NextResponse.json({ funded: false, reason: "No matching funded campaign on-chain yet." });
}
