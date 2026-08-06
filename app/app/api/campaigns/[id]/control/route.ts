import { NextResponse } from "next/server";
import { getCampaign, updateCampaign, getUser } from "../../../../../lib/store";
import { currentUserId } from "../../../../../lib/session";
import { startSession, createContractChallenge, userWalletsConfigured } from "../../../../../lib/circle-user";

/**
 * POST /api/campaigns/[id]/control — a business operating its own campaign.
 *
 * A business could post a campaign and then never touch it again: no pause, no way to
 * stop it, nothing. That is not something you would hand a real advertiser.
 *
 * What the escrow actually permits shapes what is offered here, and the difference is
 * stated rather than blurred:
 *
 *   pause / resume — off-chain. Hides the listing and stops new takes. The escrow is
 *                    untouched, and work already in flight still settles, because the
 *                    contract has no notion of pausing and inventing one in the UI
 *                    would imply the money had moved when it had not.
 *   end            — on-chain `cancel()`, signed by the business. Stops new work and
 *                    starts the settlement window; unspent budget returns after it.
 *
 * Top-up is deliberately absent: `VaneEscrow` has no such function, and a button that
 * cannot do what it says is worse than no button.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await currentUserId();
  const user = uid ? await getUser(uid) : undefined;
  if (!uid || !user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { id } = await ctx.params;
  const campaign = await getCampaign(Number(id));
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  // Only the business that posted it. Seeded campaigns have no owner and belong to
  // nobody, so nobody can operate them.
  if (campaign.ownerId !== uid) {
    return NextResponse.json({ error: "That isn't your campaign." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  if (action === "pause" || action === "resume") {
    const status = action === "pause" ? "paused" : "active";
    const updated = await updateCampaign(campaign.id, { status });
    return NextResponse.json({
      campaign: updated,
      note:
        action === "pause"
          ? "Hidden from the marketplace. Your budget stays locked, and results already in flight still settle."
          : "Live again — promoters can take it.",
    });
  }

  if (action === "end") {
    const escrow = process.env.VANE_ESCROW_ADDRESS;
    const chainId = campaign.escrowCampaignId;

    // Never funded on-chain: closing it is purely a listing change.
    if (!userWalletsConfigured || !escrow || !chainId || !user.walletId) {
      const updated = await updateCampaign(campaign.id, { status: "ended" });
      return NextResponse.json({ campaign: updated, onChain: false });
    }

    try {
      const session = await startSession(uid);
      if (!session.ready) return NextResponse.json({ error: "Set up your wallet first." }, { status: 400 });

      // The business's own money, so the business signs. Vane prepares, never approves.
      const challengeId = await createContractChallenge({
        userToken: session.userToken,
        walletId: user.walletId,
        contractAddress: escrow,
        abiFunctionSignature: "cancel(uint256)",
        abiParameters: [String(chainId)],
      });

      return NextResponse.json({
        needsApproval: true,
        auth: {
          userToken: session.userToken,
          encryptionKey: session.encryptionKey,
          appId: session.appId,
        },
        challengeId,
      });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 502 });
    }
  }

  if (action === "ended-confirmed") {
    const updated = await updateCampaign(campaign.id, { status: "ended" });
    return NextResponse.json({ campaign: updated, onChain: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
