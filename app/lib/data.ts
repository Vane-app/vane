/**
 * The shapes the UI speaks in.
 *
 * These mirror the on-chain structs deliberately: a Campaign here has the same
 * fields VaneEscrow.Campaign has, so wiring the real contract later is a swap of
 * the data source, not a rewrite of the screens. Money is always in 6-decimal
 * USDC base units — the same view the contracts use — and only ever formatted
 * for display at the edge.
 */

export type CampaignStatus = "active" | "cancelled" | "expired";
export type RewardKind = "signup" | "deposit" | "trade" | "subscription";

export interface Campaign {
  id: number;
  business: string;
  blurb: string;
  initial: string;
  colour: string;
  bonded: boolean;
  /** Per verified result, 6dp USDC base units. */
  rewardPerAction: number;
  /** Total funded, 6dp. */
  budget: number;
  /** Paid to taskers so far, 6dp. */
  spent: number;
  endsAt: number;
  kind: RewardKind;
  /** True when the campaign pays repeatedly as referred users keep acting. */
  streaming: boolean;
  /** Shown instead of a flat rate for revenue-share campaigns. */
  rateLabel?: string;
  status: CampaignStatus;
}

export interface Decision {
  id: string;
  verdict: "settled" | "held";
  /** 6dp USDC. Zero for a hold. */
  amount: number;
  tasker: string;
  reason: string;
  ago: string;
  /** Seconds the agent took, for the "verified and paid in" line. */
  tookSeconds?: number;
}

export interface Stream {
  campaignId: number;
  business: string;
  initial: string;
  colour: string;
  note: string;
  /** Total earned on this campaign, 6dp. */
  earned: number;
  spark: number[];
  live: boolean;
}

const DAY = 86_400;
const now = Math.floor(Date.now() / 1000);

export const campaigns: Campaign[] = [
  {
    id: 1,
    business: "Lumen",
    blurb: "Savings app",
    initial: "L",
    colour: "#3e6b8f",
    bonded: false,
    rewardPerAction: 2_000_000,
    budget: 500_000_000,
    spent: 158_000_000,
    endsAt: now + 22 * DAY,
    kind: "signup",
    streaming: false,
    status: "active",
  },
  {
    id: 2,
    business: "Nova Exchange",
    blurb: "Trading platform",
    initial: "N",
    colour: "#8f5a3e",
    bonded: true,
    rewardPerAction: 120_000,
    budget: 5_000_000_000,
    spent: 820_000_000,
    endsAt: now + 90 * DAY,
    kind: "trade",
    streaming: true,
    rateLabel: "0.5%",
    status: "active",
  },
  {
    id: 3,
    business: "Peakform",
    blurb: "Fitness app",
    initial: "P",
    colour: "#5a7a4e",
    bonded: false,
    rewardPerAction: 4_000_000,
    budget: 800_000_000,
    spent: 552_000_000,
    endsAt: now + 9 * DAY,
    kind: "subscription",
    streaming: false,
    status: "active",
  },
];

/** More inventory, so the marketplace looks like a marketplace. */
export const moreCampaigns: Campaign[] = [
  {
    id: 4, business: "Kite", blurb: "Freelance invoicing", initial: "K", colour: "#4a6f8f", bonded: true,
    rewardPerAction: 3_500_000, budget: 1_200_000_000, spent: 410_000_000,
    endsAt: now + 31 * DAY, kind: "signup", streaming: false, status: "active",
  },
  {
    id: 5, business: "Harbour", blurb: "Business banking", initial: "H", colour: "#7a5f8f", bonded: true,
    rewardPerAction: 12_000_000, budget: 3_000_000_000, spent: 1_140_000_000,
    endsAt: now + 45 * DAY, kind: "deposit", streaming: false, status: "active",
  },
  {
    id: 6, business: "Loop", blurb: "Payments API", initial: "O", colour: "#3f7f6d", bonded: false,
    rewardPerAction: 260_000, budget: 900_000_000, spent: 122_000_000,
    endsAt: now + 60 * DAY, kind: "trade", streaming: true, rateLabel: "1.2%", status: "active",
  },
  {
    id: 7, business: "Verdant", blurb: "Green energy app", initial: "V", colour: "#5f8f4a", bonded: false,
    rewardPerAction: 6_000_000, budget: 640_000_000, spent: 512_000_000,
    endsAt: now + 6 * DAY, kind: "subscription", streaming: false, status: "active",
  },
  {
    id: 8, business: "Atlas Pay", blurb: "Cross-border payouts", initial: "A", colour: "#8f6b3e", bonded: true,
    rewardPerAction: 8_000_000, budget: 2_400_000_000, spent: 300_000_000,
    endsAt: now + 52 * DAY, kind: "signup", streaming: false, status: "active",
  },
];

export const decisions: Decision[] = [
  {
    id: "d1",
    verdict: "settled",
    amount: 2_000_000,
    tasker: "Tunde",
    reason: "Referral traced on-chain. Account stayed active after signing up.",
    ago: "2s ago",
    tookSeconds: 1.2,
  },
  {
    id: "d2",
    verdict: "settled",
    amount: 2_000_000,
    tasker: "Amara",
    reason: "Referral traced on-chain. New tasker, standard checks passed.",
    ago: "1m ago",
    tookSeconds: 1.4,
  },
  {
    id: "d3",
    verdict: "held",
    amount: 0,
    tasker: "unknown",
    reason: "Three wallets created within the same hour, silent after signing up.",
    ago: "4m ago",
  },
  {
    id: "d4",
    verdict: "settled",
    amount: 2_000_000,
    tasker: "Tunde",
    reason: "Referral traced on-chain. Account stayed active after signing up.",
    ago: "6m ago",
    tookSeconds: 0.9,
  },
];

export const streams: Stream[] = [
  {
    campaignId: 2,
    business: "Nova Exchange",
    initial: "N",
    colour: "#8f5a3e",
    note: "Earns while your referrals trade",
    earned: 38_900_000,
    spark: [4, 6, 5, 9, 8, 14, 17],
    live: true,
  },
  {
    campaignId: 1,
    business: "Lumen",
    initial: "L",
    colour: "#3e6b8f",
    note: "11 verified signups",
    earned: 22_000_000,
    spark: [2, 3, 7, 6, 10, 10, 12],
    live: false,
  },
  {
    campaignId: 3,
    business: "Peakform",
    initial: "P",
    colour: "#5a7a4e",
    note: "Starts when your first referral subscribes",
    earned: 0,
    spark: [],
    live: false,
  },
];

export interface Person {
  name: string;
  role: string;
  face: string;
  /** Earned on this campaign, 6dp. */
  earned: number;
}

/** The people actually promoting a campaign. Placeholder portraits until real ones land. */
export const promoters: Person[] = [
  { name: "Tunde", role: "Creator", face: "https://randomuser.me/api/portraits/men/32.jpg", earned: 22_000_000 },
  { name: "Amara", role: "Newsletter", face: "https://randomuser.me/api/portraits/women/44.jpg", earned: 14_000_000 },
  { name: "Ife", role: "Community", face: "https://randomuser.me/api/portraits/women/68.jpg", earned: 9_000_000 },
  { name: "Marvin", role: "Creator", face: "https://randomuser.me/api/portraits/men/75.jpg", earned: 6_000_000 },
  { name: "Chidi", role: "Reviews", face: "https://randomuser.me/api/portraits/men/13.jpg", earned: 4_000_000 },
];

/** Launch pricing. Below card-processing rates, so trying Vane is never a cost decision. */
export const FEE_BPS = 250;

/** Format 6-decimal USDC base units for humans. */
export function usd(base: number, opts: { cents?: boolean } = {}): string {
  const value = base / 1_000_000;
  const cents = opts.cents ?? value < 1000;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
}

export function remaining(c: Campaign): number {
  return c.budget - c.spent;
}

export function poolPercent(c: Campaign): number {
  return Math.max(0, Math.min(100, (remaining(c) / c.budget) * 100));
}

export function daysLeft(c: Campaign): number {
  return Math.max(0, Math.ceil((c.endsAt - Math.floor(Date.now() / 1000)) / DAY));
}

export function rate(c: Campaign): string {
  return c.rateLabel ?? usd(c.rewardPerAction);
}

export function rateNote(c: Campaign): string {
  switch (c.kind) {
    case "signup":
      return "per verified signup";
    case "deposit":
      return "per first deposit";
    case "trade":
      return "of every trade your referrals make";
    case "subscription":
      return "per subscription";
  }
}
