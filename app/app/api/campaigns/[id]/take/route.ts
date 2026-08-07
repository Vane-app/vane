import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { takeCampaign, getCampaign, getUser } from "../../../../../lib/store";
import { currentUserId } from "../../../../../lib/session";
import { startSession, createContractChallenge, userWalletsConfigured } from "../../../../../lib/circle-user";

/**
 * POST /api/campaigns/[id]/take — a tasker takes a campaign.
 *
 * Taking a campaign is an on-chain act: it claims a referral code in the
 * ReferralRegistry, which is what makes attribution permanent and unrewritable. It is
 * therefore the tasker's transaction to sign, not ours. We prepare the call and hand
 * back a challenge; the tasker approves it with their PIN inside Circle's UI.
 *
 * Vane cannot complete this on their behalf, which is the same property that stops us
 * moving their earnings. When Circle isn't configured we fall back to recording the
 * take locally so the demo stays clickable — and say so in the response rather than
 * pretending something was sealed on-chain.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await currentUserId();
  const user = uid ? await getUser(uid) : undefined;
  if (!uid || !user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { id } = await ctx.params;
  const campaignId = Number(id);
  const campaign = await getCampaign(campaignId);
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  /**
   * A referral nobody can seal is a referral nobody can be paid for.
   *
   * Taking a funded campaign without a wallet used to succeed: the take was written,
   * a link came back, and the response said `sealed: false` with nothing else — no
   * flag, no error, nothing the screen could act on. So it showed the link. Whoever
   * shared it did everything right, and the first person to convert through it hit a
   * registry with no referral on record, emitted NotAttributed, and paid no one. The
   * dead end was invisible from both ends.
   *
   * Refused before the take exists, so there is no orphaned row and no link that was
   * never going to work. Only for campaigns that are actually funded on-chain — an
   * unfunded listing has nothing to seal against, and that is a different situation
   * the response already describes honestly.
   */
  if (userWalletsConfigured && process.env.VANE_REGISTRY_ADDRESS && campaign.escrowCampaignId && !user.walletId) {
    return NextResponse.json(
      {
        error: "Set up your wallet first — it's what seals the referral on Arc and receives the payout.",
        needsWallet: true,
      },
      { status: 409 },
    );
  }

  const take = await takeCampaign(uid, campaignId);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://vane.money";
  const link = `${base.replace(/^https?:\/\//, "")}/r/${take.refCode}`;
  const payload = {
    take: { id: take.id, refCode: take.refCode, results: take.results, earned: take.earned },
    link,
  };

  const registry = process.env.VANE_REGISTRY_ADDRESS;
  const chainId = campaign.escrowCampaignId;

  // Off-chain only: no registry deployed, no Circle, or this campaign was never
  // funded on-chain. Still a valid take — just not a sealed one.
  if (!userWalletsConfigured || !registry || !chainId || !user.walletId) {
    return NextResponse.json({ ...payload, sealed: false });
  }

  try {
    const session = await startSession(uid);
    if (!session.ready) {
      return NextResponse.json({ ...payload, sealed: false, needsWallet: true });
    }

    const challengeId = await createContractChallenge({
      userToken: session.userToken,
      walletId: user.walletId,
      contractAddress: registry,
      abiFunctionSignature: "claimCode(uint256,bytes32)",
      abiParameters: [String(chainId), codeHash(take.refCode)],
    });

    return NextResponse.json({
      ...payload,
      sealed: false, // becomes true once the tasker approves and the tx confirms
      challenge: {
        challengeId,
        userToken: session.userToken,
        encryptionKey: session.encryptionKey,
        appId: session.appId,
      },
    });
  } catch (err) {
    // A failed challenge must not lose the take — the tasker still holds the campaign.
    return NextResponse.json({ ...payload, sealed: false, error: (err as Error).message });
  }
}

/** The on-chain code is a bytes32 hash of the human-readable referral code. */
function codeHash(refCode: string): string {
  return `0x${createHash("sha256").update(refCode).digest("hex")}`;
}
