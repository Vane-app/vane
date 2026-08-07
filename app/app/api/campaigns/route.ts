import { NextResponse } from "next/server";
import { pricingError } from "../../../lib/pricing";
import { listCampaigns, createCampaign, getUser } from "../../../lib/store";
import { currentUserId } from "../../../lib/session";
import { startSession, createContractChallenge, userWalletsConfigured } from "../../../lib/circle-user";
import { nextEscrowCampaignId } from "../../../lib/chain";
import { updateCampaign } from "../../../lib/store";
import { eq } from "drizzle-orm";
import { db, schema } from "../../../lib/db/client";

/** The domain this account has proved it controls, if any. */
async function provedDomain(userId: string): Promise<string> {
  if (!db) return "";
  const [row] = await db
    .select({ domain: schema.users.domain, verifiedAt: schema.users.domainVerifiedAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return row?.verifiedAt ? (row.domain ?? "") : "";
}
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
  // "Check the rate and budget" told a business nothing about which number was wrong or
  // what would be right. It also let through rates no promoter would ever take, which
  // cost the business a funded campaign that then sat unclaimed.
  const badPricing = pricingError(rewardPerAction, budget);
  if (badPricing) {
    return NextResponse.json({ error: badPricing }, { status: 400 });
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
    // Snapshot the proved domain so a card can show it without joining users on
    // every marketplace query. Proving later backfills existing campaigns.
    verifiedDomain: await provedDomain(id),
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

    /**
     * Authorise the product to report conversions.
     *
     * `recordConversion` only accepts a reporter the campaign owner has approved, and
     * the registry checks `msg.sender` against that owner — so this is the business's
     * signature to give, nobody else's. Without it a campaign funds successfully and
     * then silently cannot receive a single result, which is the worst possible place
     * for a missing step to surface.
     *
     * Folded into posting rather than left as a separate screen: a business should not
     * have to know that authorising a reporter is a thing.
     */
    const registry = process.env.VANE_REGISTRY_ADDRESS;
    const reporter = process.env.VANE_DEMO_BUSINESS_ADDRESS;
    const challenges = [
      { step: "approve", challengeId: approveChallenge },
      { step: "fund", challengeId: fundChallenge },
    ];

    if (registry && reporter && predictedId !== null) {
      challenges.push({
        step: "authorise",
        challengeId: await createContractChallenge({
          ...common,
          contractAddress: registry,
          abiFunctionSignature: "setReporter(uint256,address,bool)",
          abiParameters: [String(predictedId), reporter, true],
        }),
      });
    }

    return NextResponse.json({
      campaign: c,
      funded: false, // true only once the business has approved these on-chain
      auth: {
        userToken: session.userToken,
        encryptionKey: session.encryptionKey,
        appId: session.appId,
      },
      challenges,
    });
  } catch (err) {
    // The listing exists either way; only the on-chain funding failed.
    return NextResponse.json({ campaign: c, funded: false, error: (err as Error).message });
  }
}
