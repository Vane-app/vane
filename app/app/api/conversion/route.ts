import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { findTakeByCode, creditResult, getCampaign } from "../../../lib/store";

/**
 * POST /api/conversion — a web2 business reports a result.
 *
 * This was open. No authentication of any kind, and it credited a payout. Referral
 * codes are public by design — they are the shareable part of the link — so anyone
 * who saw one could post it here repeatedly and credit themselves. On a marketplace
 * that pays per result, that is free money.
 *
 * It is now a signed webhook, which is what a real integration would be anyway. The
 * business holds a shared secret and signs the raw body; without VANE_WEBHOOK_SECRET
 * set the route refuses everything rather than falling open.
 *
 * A note on what this path is and is not. On-chain conversions do not come through
 * here — the falcon watches `ConversionRecorded` on Arc directly, which is the
 * trustless route and the one the product demos. This is Tier 2: a business's own
 * claim about its own users, which is *protected* rather than trustless. The signature
 * proves the claim came from the business, not that the result happened.
 *
 * It also no longer decides anything. There was a second, simplified copy of the
 * decision engine in lib/agent.ts scoring these inline, so the same claimed result
 * could be judged one way here and another way by the real engine. One engine
 * (agent/src/decision.ts), one verdict.
 */
export async function POST(req: Request) {
  const secret = process.env.VANE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Conversion reporting is not enabled on this deployment." },
      { status: 503 },
    );
  }

  // Read the raw body: the signature covers the exact bytes sent, and re-serialising
  // parsed JSON would not reproduce them.
  const raw = await req.text();
  const provided = req.headers.get("x-vane-signature") ?? "";
  const expected = createHmac("sha256", secret).update(raw).digest("hex");

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Bad signature." }, { status: 401 });
  }

  const body = JSON.parse(raw || "{}") as { refCode?: string };
  const refCode = String(body.refCode ?? "");
  const take = await findTakeByCode(refCode);
  if (!take) return NextResponse.json({ error: "Unknown referral code." }, { status: 404 });

  const campaign = await getCampaign(take.campaignId);
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  if (campaign.status !== "active") {
    return NextResponse.json({ error: "That campaign is not running." }, { status: 409 });
  }
  if (campaign.spent + campaign.rewardPerAction > campaign.budget) {
    return NextResponse.json({ error: "Campaign budget is spent." }, { status: 409 });
  }

  await creditResult(refCode, campaign.rewardPerAction);

  return NextResponse.json({
    accepted: true,
    // Deliberately not "settled". Nothing has moved on-chain; the falcon settles.
    note: "Recorded. The agent verifies it before any payout is released.",
  });
}
