import { NextResponse } from "next/server";
import { findTakeByCode, creditResult, getCampaign, earningsFor } from "../../../lib/store";
import { decide, type ConversionSignals } from "../../../lib/agent";

/**
 * POST /api/conversion — a claimed result arrives.
 *
 * This is the heart of the loop. For a web2 business it's a signed webhook from
 * their integration; for a web3 business the chain listener calls it with the tx
 * as evidence. The falcon scores it, and honest results are credited (and, in
 * the full flow, settled onchain from escrow); fraud is refused with a reason.
 *
 * Body: { refCode, wallet?, signals? }  — signals optional; sensible defaults
 * model a genuine conversion so the happy path is demonstrable.
 */
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const refCode = String(b.refCode ?? "");
  const take = findTakeByCode(refCode);
  if (!take) return NextResponse.json({ error: "Unknown referral code." }, { status: 404 });

  const campaign = getCampaign(take.campaignId);
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  const e = earningsFor(take.userId);
  const attempts = take.results;
  const approvalRate = attempts > 0 ? 1 : 0.85; // clean record so far, or neutral for a newcomer

  const signals: ConversionSignals = {
    timeToConvert: Number(b.signals?.timeToConvert ?? 600),
    walletTxCount: Number(b.signals?.walletTxCount ?? 12),
    activityAfter: Number(b.signals?.activityAfter ?? 3),
    velocity: Number(b.signals?.velocity ?? take.results + 1),
    approvalRate,
    funderConcentration: Number(b.signals?.funderConcentration ?? 1),
    ...(b.signals ?? {}),
  };

  const decision = decide(signals);

  if (decision.verdict === "settled") {
    creditResult(refCode, campaign.rewardPerAction);
  }

  const after = earningsFor(take.userId);
  return NextResponse.json({
    decision,
    reward: decision.verdict === "settled" ? campaign.rewardPerAction : 0,
    balance: after.available,
    business: campaign.business,
    kind: campaign.web3 ? "onchain" : "integration",
  });
}
