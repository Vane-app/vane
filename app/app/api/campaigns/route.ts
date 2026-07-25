import { NextResponse } from "next/server";
import { listCampaigns, createCampaign, getUser } from "../../../lib/store";
import { currentUserId } from "../../../lib/session";
import type { Industry, TaskType } from "../../../lib/data";

/** GET /api/campaigns — the marketplace inventory (active campaigns). */
export async function GET() {
  return NextResponse.json({ campaigns: listCampaigns() });
}

/**
 * POST /api/campaigns — a business funds a new campaign.
 *
 * In the full flow this also locks the budget into VaneEscrow onchain; here it
 * creates the campaign and records the funded budget. Requires a session.
 *
 * Body: { business, industry, taskType, kind, rewardPerAction, budget,
 *         durationDays, bonded }  (money in 6dp USDC base units)
 */
export async function POST(req: Request) {
  const id = await currentUserId();
  if (!id) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const u = getUser(id);
  if (!u) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const name = String(b.business ?? u.name ?? "Your business").trim();
  const rewardPerAction = Number(b.rewardPerAction);
  const budget = Number(b.budget);
  if (!rewardPerAction || !budget || rewardPerAction > budget) {
    return NextResponse.json({ error: "Check the rate and budget." }, { status: 400 });
  }

  const c = createCampaign({
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
  });

  return NextResponse.json({ campaign: c });
}
