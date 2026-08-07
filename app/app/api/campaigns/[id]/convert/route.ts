import { NextResponse } from "next/server";
import { parseAbi, stringToHex } from "viem";
import { getCampaign, getUser, findTakeByCode } from "../../../../../lib/store";
import { currentUserId } from "../../../../../lib/session";
import { publicClient, withRetry } from "../../../../../lib/chain";
import { startSession, createContractChallenge, userWalletsConfigured } from "../../../../../lib/circle-user";
import { executeContract, waitForTransaction } from "@vane/agent/wallets";

/**
 * POST /api/campaigns/[id]/convert — a referred visitor does the thing.
 *
 * The missing half of the loop. A tasker could take a campaign, seal the referral on
 * Arc and share a link, and then nothing existed that could record a result: the
 * marketplace could be browsed, joined and shared, and never paid anybody. The falcon
 * was watching an event no code in the product could emit.
 *
 * This is the visitor's own transaction, not ours. `DemoBusiness.convert` is called by
 * whoever performed the action, which is what makes the conversion a fact about them
 * rather than a claim by us — the same property that makes the referral seal theirs.
 * We prepare the call; they approve it with their PIN inside Circle's UI.
 *
 * DemoBusiness stands in for a business's own product. A real integration calls
 * `recordConversion` from its own backend when a signup or deposit actually happens;
 * the demo needs something a judge can perform in a browser, and this is that thing.
 */

const demoAbi = parseAbi(["function campaignId() view returns (uint256)"]);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await currentUserId();
  const user = uid ? await getUser(uid) : undefined;
  if (!uid || !user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { id } = await ctx.params;
  const campaign = await getCampaign(Number(id));
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  const demo = process.env.VANE_DEMO_BUSINESS_ADDRESS as `0x${string}` | undefined;
  const chainId = campaign.escrowCampaignId;
  if (!demo || !chainId) {
    return NextResponse.json(
      { error: "This campaign has no funded escrow behind it, so a result could not be paid." },
      { status: 409 },
    );
  }
  // The referral being converted. Without one the registry will decline to record and
  // the visitor would approve a transaction that could never pay anyone — better to say
  // so before they sign than to emit NotAttributed and leave them guessing.
  const body = await req.json().catch(() => ({}));
  const refCode = String(body.refCode ?? "").trim();
  const take = refCode ? await findTakeByCode(refCode) : undefined;
  if (!take || take.campaignId !== campaign.id) {
    return NextResponse.json(
      { error: "This needs a referral link. Open the promoter's link and try from there." },
      { status: 409 },
    );
  }
  if (take.userId === uid) {
    // Self-referral is the cheapest possible fraud, and the falcon would hold it anyway.
    // Refusing here costs the person a wasted signature rather than a held payout.
    return NextResponse.json(
      { error: "You can't convert your own referral link." },
      { status: 409 },
    );
  }

  /**
   * The wallet is asked for last, on purpose.
   *
   * Checking it first meant someone who opened a campaign without a referral link was
   * told to go and set up a wallet — PIN, recovery questions, the whole thing — and
   * only afterwards learned that the conversion was never going to be attributable to
   * anyone. The cheap, informative refusals belong before the expensive detour.
   */
  if (!userWalletsConfigured || !user.walletId) {
    return NextResponse.json(
      { error: "Set up your wallet first — the conversion is your transaction to sign.", needsWallet: true },
      { status: 409 },
    );
  }

  try {
    /**
     * Point the stand-in business at this campaign.
     *
     * DemoBusiness carries a single campaignId, so a conversion is always recorded
     * against whichever campaign it was last set to. With two campaigns live, leaving
     * it alone means half the marketplace records against the wrong one and the
     * registry quietly declines — the exact dead end this route exists to remove.
     *
     * Only the owner may set it, and the falcon is the owner. Two people converting
     * different campaigns in the same second could still interleave; that is a real
     * limitation of one shared demo contract rather than of the design, and a business
     * running its own integration never has it.
     */
    const current = await withRetry(() =>
      publicClient.readContract({ address: demo, abi: demoAbi, functionName: "campaignId" }),
    );

    if (Number(current) !== chainId) {
      const walletId = process.env.CIRCLE_AGENT_WALLET_ID;
      if (!walletId) throw new Error("CIRCLE_AGENT_WALLET_ID is not set.");
      const tx = await executeContract({
        walletId,
        contractAddress: demo,
        abiFunctionSignature: "setCampaign(uint256)",
        abiParameters: [String(chainId)],
      });
      const txId = (tx as { id?: string })?.id;
      if (txId) await waitForTransaction(txId).catch(() => null);
    }

    const session = await startSession(uid);
    if (!session.ready) {
      return NextResponse.json({ error: "Set up your wallet first.", needsWallet: true }, { status: 409 });
    }

    const challengeId = await createContractChallenge({
      userToken: session.userToken,
      walletId: user.walletId,
      contractAddress: demo,
      abiFunctionSignature: "convert(bytes32)",
      // The tag the business is paying for, carried through to the decision log.
      abiParameters: [stringToHex(campaign.kind || "signup", { size: 32 })],
    });

    return NextResponse.json({
      challenge: {
        challengeId,
        userToken: session.userToken,
        encryptionKey: session.encryptionKey,
        appId: session.appId,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
