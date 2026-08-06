import { NextResponse } from "next/server";
import { listCampaigns, createCampaign, getUser } from "../../../lib/store";
import { currentUserId } from "../../../lib/session";
import { startSession, createContractChallenge, userWalletsConfigured } from "../../../lib/circle-user";
import { nextEscrowCampaignId } from "../../../lib/chain";
import { updateCampaign } from "../../../lib/store";
import type { Industry, TaskType } from "../../../lib/data";

const USDC = "0x3600000000000000000000000000000000000000";

/** GET /api/campaigns — the marketplace inventory (active campaigns). */
export async function GET() {
  return NextResponse.json({ campaigns: await listCampaigns() });
}

/**
 * POST /api/campaigns — a business funds a new campaign.
 *
 * Funding locks the business's own USDC into VaneEscrow, so it is the business's
 * transaction to sign, not ours. We create the listing and hand back two challenges
 * to approve in order: `approve` so the vault may pull the budget, then
 * `createCampaign` which locks it. Vane can prepare both and authorise neither.
 *
 * Two steps rather than one because ERC-20 needs the allowance to exist before the
 * pull. The client must not fire them in parallel.
 *
 * Body: { business, industry, taskType, kind, rewardPerAction, budget,
 *         durationDays, bonded }  (money in 6dp USDC base units)
 */
export async function POST(req: Request) {
  const id = await currentUserId();
  if (!id) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const u = await getUser(id);
  if (!u) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const name = String(b.business ?? u.name ?? "Your business").trim();
  const rewardPerAction = Number(b.rewardPerAction);
  const budget = Number(b.budget);
  if (!rewardPerAction || !budget || rewardPerAction > budget) {
    return NextResponse.json({ error: "Check the rate and budget." }, { status: 400 });
  }

  const c = await createCampaign({
    business: name,
    blurb: String(b.blurb ?? ""),
    initial: name[0]?.toUpperCase() ?? "V",
    colour: b.colour ?? "#3e6b8f",
    industry: (b.industry ?? "Payments") as Industry,
    taskType: (b.taskType ?? "referral") as TaskType,
    kind: b.kind === "web3" ? "web3" : "web2",
    rewardPerAction,
    budget,
    durationDays: Number(b.durationDays ?? 30),
    bonded: Boolean(b.bonded),
    ownerId: id, // so the business dashboard can show this campaign, and only to them
    // The business uploaded a logo at signup and it was never used anywhere. A
    // marketplace of coloured letters looks like a placeholder, not a marketplace.
    logoUrl: String(b.logoUrl ?? u.avatar ?? ""),
  });

  const escrow = process.env.VANE_ESCROW_ADDRESS;
  if (!userWalletsConfigured || !escrow || !u.walletId) {
    return NextResponse.json({ campaign: c, funded: false });
  }

  try {
    const session = await startSession(id);
    if (!session.ready) {
      return NextResponse.json({ campaign: c, funded: false, needsWallet: true });
    }

    /**
     * Bind the listing to its on-chain id before the business signs.
     *
     * `createCampaign` assigns ids sequentially, so the id this funding will receive is
     * whatever `nextCampaignId` reads right now. Without recording it the campaign can
     * never be sealed against or settled — which is exactly how the app's loop was
     * silently broken while the scripts worked.
     *
     * Two businesses funding in the same instant would both predict the same id; the
     * confirm step re-reads the chain and corrects it.
     */
    const predictedId = await nextEscrowCampaignId(escrow as `0x${string}`).catch(() => null);
    if (predictedId !== null) await updateCampaign(c.id, { escrowCampaignId: predictedId });

    const durationSeconds = Math.round(Number(b.durationDays ?? 30) * 86_400);
    const common = {
      userToken: session.userToken,
      walletId: u.walletId,
    };

    const approveChallenge = await createContractChallenge({
      ...common,
      contractAddress: USDC,
      abiFunctionSignature: "approve(address,uint256)",
      abiParameters: [escrow, String(budget)],
    });

    const fundChallenge = await createContractChallenge({
      ...common,
      contractAddress: escrow,
      abiFunctionSignature: "createCampaign(uint128,uint96,uint64,uint64)",
      abiParameters: [String(budget), String(rewardPerAction), String(durationSeconds), "0"],
    });

    return NextResponse.json({
      campaign: c,
      funded: false, // true only once the business has approved both on-chain
      auth: {
        userToken: session.userToken,
        encryptionKey: session.encryptionKey,
        appId: session.appId,
      },
      challenges: [
        { step: "approve", challengeId: approveChallenge },
        { step: "fund", challengeId: fundChallenge },
      ],
    });
  } catch (err) {
    // The listing exists either way; only the on-chain funding failed.
    return NextResponse.json({ campaign: c, funded: false, error: (err as Error).message });
  }
}
