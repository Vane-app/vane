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
export type RewardKind = "signup" | "deposit" | "trade" | "subscription" | "post" | "review" | "mint";

/** The four ways to earn on Vane — one settlement engine underneath all of them. */
export type TaskType = "referral" | "content" | "onchain" | "bounty";
export type Effort = "quick" | "medium" | "involved";
export type Industry =
  | "Trading"
  | "Payments"
  | "Banking"
  | "Savings"
  | "DeFi"
  | "Wallet"
  | "NFT"
  | "Fitness"
  | "Energy"
  | "Creator tools";

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
  /** Marketplace facets. */
  taskType: TaskType;
  industry: Industry;
  effort: Effort;
  /** Onchain businesses verify trustlessly; web businesses verify by integration. */
  web3: boolean;
  /** Sort signal: how many promoters have taken it. */
  taken: number;
}

export const TASK_TYPES: { id: TaskType; label: string; verb: string }[] = [
  { id: "referral", label: "Referral", verb: "Refer users" },
  { id: "content", label: "Content", verb: "Post content" },
  { id: "onchain", label: "Onchain action", verb: "Drive onchain actions" },
  { id: "bounty", label: "Bounty", verb: "Deliver a task" },
];

export const EFFORT_LABEL: Record<Effort, string> = {
  quick: "Quick",
  medium: "Medium",
  involved: "Involved",
};

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

/** Per-campaign performance — what a promoter actually needs to judge their work. */
export interface Performance {
  campaignId: number;
  business: string;
  initial: string;
  colour: string;
  clicks: number;
  results: number;
  /** 6dp USDC */
  earned: number;
  held: number;
  live: boolean;
}

export const performance: Performance[] = [
  { campaignId: 2, business: "Nova Exchange", initial: "N", colour: "#8f5a3e", clicks: 4_182, results: 311, earned: 1_392_500_000, held: 0, live: true },
  { campaignId: 1, business: "Lumen", initial: "L", colour: "#3e6b8f", clicks: 1_940, results: 342, earned: 684_000_000, held: 4_000_000, live: true },
  { campaignId: 3, business: "Peakform", initial: "P", colour: "#5a7a4e", clicks: 806, results: 193, earned: 771_000_000, held: 8_000_000, live: false },
];

/** Daily earnings, 6dp, oldest first — 30 days. */
export const earningsSeries: number[] = [
  18, 22, 19, 31, 27, 24, 35, 41, 38, 33, 47, 52, 44, 58, 61, 55, 67, 72, 64, 79, 86, 74, 91, 98, 88, 104, 112,
  99, 121, 134,
].map((n) => n * 1_000_000);

export const payouts = [
  { id: "p1", label: "Trade share · Nova Exchange", amount: 320_000, when: "Just now", state: "paid" as const },
  { id: "p2", label: "Signup verified · Lumen", amount: 2_000_000, when: "4 min ago", state: "paid" as const },
  { id: "p3", label: "Signup verified · Lumen", amount: 2_000_000, when: "26 min ago", state: "paid" as const },
  { id: "p4", label: "Subscription · Peakform", amount: 4_000_000, when: "1 hr ago", state: "paid" as const },
  { id: "p5", label: "Signup · Lumen", amount: 2_000_000, when: "2 hr ago", state: "checking" as const },
  { id: "p6", label: "Trade share · Nova Exchange", amount: 280_000, when: "3 hr ago", state: "paid" as const },
  { id: "p7", label: "Signup · Lumen", amount: 2_000_000, when: "5 hr ago", state: "held" as const },
];

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
    id: 1, business: "Lumen", blurb: "Savings app", initial: "L", colour: "#3e6b8f", bonded: false,
    rewardPerAction: 2_000_000, budget: 500_000_000, spent: 158_000_000, endsAt: now + 22 * DAY,
    kind: "signup", streaming: false, status: "active",
    taskType: "referral", industry: "Savings", effort: "quick", web3: false, taken: 41,
  },
  {
    id: 2, business: "Nova Exchange", blurb: "Trading platform", initial: "N", colour: "#8f5a3e", bonded: true,
    rewardPerAction: 120_000, budget: 5_000_000_000, spent: 820_000_000, endsAt: now + 90 * DAY,
    kind: "trade", streaming: true, rateLabel: "0.5%", status: "active",
    taskType: "referral", industry: "Trading", effort: "medium", web3: true, taken: 128,
  },
  {
    id: 3, business: "Peakform", blurb: "Fitness app", initial: "P", colour: "#5a7a4e", bonded: false,
    rewardPerAction: 4_000_000, budget: 800_000_000, spent: 552_000_000, endsAt: now + 9 * DAY,
    kind: "subscription", streaming: false, status: "active",
    taskType: "referral", industry: "Fitness", effort: "medium", web3: false, taken: 22,
  },
];

/** Full marketplace inventory across all four task types. */
export const moreCampaigns: Campaign[] = [
  {
    id: 4, business: "Kite", blurb: "Freelance invoicing", initial: "K", colour: "#4a6f8f", bonded: true,
    rewardPerAction: 3_500_000, budget: 1_200_000_000, spent: 410_000_000, endsAt: now + 31 * DAY,
    kind: "signup", streaming: false, status: "active",
    taskType: "referral", industry: "Payments", effort: "quick", web3: false, taken: 63,
  },
  {
    id: 5, business: "Harbour", blurb: "Business banking", initial: "H", colour: "#7a5f8f", bonded: true,
    rewardPerAction: 12_000_000, budget: 3_000_000_000, spent: 1_140_000_000, endsAt: now + 45 * DAY,
    kind: "deposit", streaming: false, status: "active",
    taskType: "referral", industry: "Banking", effort: "involved", web3: false, taken: 37,
  },
  {
    id: 6, business: "Loop", blurb: "Payments API", initial: "O", colour: "#3f7f6d", bonded: false,
    rewardPerAction: 260_000, budget: 900_000_000, spent: 122_000_000, endsAt: now + 60 * DAY,
    kind: "trade", streaming: true, rateLabel: "1.2%", status: "active",
    taskType: "referral", industry: "Payments", effort: "medium", web3: true, taken: 54,
  },
  {
    id: 7, business: "Aster DAO", blurb: "DeFi lending", initial: "A", colour: "#4a5f8f", bonded: true,
    rewardPerAction: 15_000_000, budget: 4_000_000_000, spent: 900_000_000, endsAt: now + 40 * DAY,
    kind: "deposit", streaming: false, status: "active",
    taskType: "onchain", industry: "DeFi", effort: "medium", web3: true, taken: 71,
  },
  {
    id: 8, business: "Prism", blurb: "NFT marketplace", initial: "P", colour: "#8f5a7a", bonded: false,
    rewardPerAction: 5_000_000, budget: 700_000_000, spent: 210_000_000, endsAt: now + 18 * DAY,
    kind: "mint", streaming: false, status: "active",
    taskType: "onchain", industry: "NFT", effort: "quick", web3: true, taken: 44,
  },
  {
    id: 9, business: "Verdant", blurb: "Green energy app", initial: "V", colour: "#5f8f4a", bonded: false,
    rewardPerAction: 3_000_000, budget: 400_000_000, spent: 180_000_000, endsAt: now + 12 * DAY,
    kind: "post", streaming: false, status: "active",
    taskType: "content", industry: "Energy", effort: "quick", web3: false, taken: 96,
  },
  {
    id: 10, business: "Cadence", blurb: "Creator payments", initial: "C", colour: "#8f7a3e", bonded: true,
    rewardPerAction: 8_000_000, budget: 1_600_000_000, spent: 320_000_000, endsAt: now + 28 * DAY,
    kind: "review", streaming: false, status: "active",
    taskType: "content", industry: "Creator tools", effort: "medium", web3: false, taken: 58,
  },
  {
    id: 11, business: "Beacon Wallet", blurb: "Self-custody wallet", initial: "B", colour: "#3f7f6d", bonded: true,
    rewardPerAction: 6_000_000, budget: 2_200_000_000, spent: 640_000_000, endsAt: now + 55 * DAY,
    kind: "signup", streaming: false, status: "active",
    taskType: "onchain", industry: "Wallet", effort: "quick", web3: true, taken: 83,
  },
  {
    id: 12, business: "Atlas Pay", blurb: "Cross-border payouts", initial: "A", colour: "#8f6b3e", bonded: true,
    rewardPerAction: 40_000_000, budget: 2_400_000_000, spent: 300_000_000, endsAt: now + 20 * DAY,
    kind: "signup", streaming: false, status: "active",
    taskType: "bounty", industry: "Payments", effort: "involved", web3: false, taken: 9,
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

/** Everything a promoter needs to decide whether a campaign is worth their time. */
export interface CampaignDetail {
  category: string;
  /** Web2 businesses report conversions through an integration; Web3 conversions
   *  happen onchain and need nobody's word for it. The falcon verifies both, but
   *  it is honest about which is which. */
  kind: "web2" | "web3";
  verification: string;
  /** What the agent checks before it releases money on this campaign. */
  agentChecks: string[];
  /** Plain-English definition of the paid event. */
  counts: string;
  /** What you must do, and what voids a payout. */
  rules: string[];
  notAllowed: string[];
  /** How long after a click the referral stays credited to you. */
  attributionDays: number;
  /** Live performance, so nobody takes a campaign blind. */
  promoters: number;
  totalPaid: number;
  approvalRate: number;
  medianPayoutSeconds: number;
  /** The business's own record across all its campaigns. */
  businessSince: string;
  businessCampaigns: number;
  businessDisputes: number;
}

export const details: Record<number, CampaignDetail> = {
  1: {
    category: "Personal finance",
    kind: "web2",
    verification:
      "Lumen reports each signup to Vane through a verified integration. The falcon cross-checks every claim against wallet history and post-signup behaviour before releasing money, and Lumen's bonded deposit covers disputes.",
    agentChecks: [
      "Signup traced to your referral link",
      "Account shows real activity after signing up",
      "No cluster of accounts created together",
      "Your own approval record",
    ],
    counts: "A new user completes signup and verifies their email.",
    rules: [
      "Share your link anywhere you have a genuine audience",
      "Describe the product accurately — Lumen is a savings app, not an investment product",
      "Referred users must complete signup themselves",
    ],
    notAllowed: ["Paid search on the brand name", "Incentivised or bought signups", "Multiple accounts from one person"],
    attributionDays: 30,
    promoters: 41,
    totalPaid: 158_000_000,
    approvalRate: 0.93,
    medianPayoutSeconds: 1.2,
    businessSince: "March 2026",
    businessCampaigns: 3,
    businessDisputes: 0,
  },
  2: {
    category: "Trading",
    kind: "web3",
    verification:
      "Every trade settles onchain, and your referral was sealed before the customer converted. The falcon reads the evidence directly — nobody reports anything, and nothing can be rewritten after the fact.",
    agentChecks: [
      "Trade recorded onchain under your sealed referral",
      "Referral seal predates the trade",
      "Wallet has genuine trading history",
      "Volume pattern is not self-dealing",
    ],
    counts: "Any trade placed by someone you referred — for as long as they keep trading.",
    rules: [
      "You earn 0.5% of trading fees on every referred trade, indefinitely",
      "Referred users must complete identity checks before payouts begin",
      "Earnings stream continuously, settled per trade",
    ],
    notAllowed: ["Promising specific returns", "Self-referral", "Automated or wash trading"],
    attributionDays: 90,
    promoters: 128,
    totalPaid: 820_000_000,
    approvalRate: 0.97,
    medianPayoutSeconds: 0.9,
    businessSince: "January 2026",
    businessCampaigns: 7,
    businessDisputes: 1,
  },
  3: {
    category: "Health & fitness",
    kind: "web2",
    verification:
      "Peakform reports converted subscriptions through an integration. The falcon holds anything that looks like trial abuse and checks that the subscription survived the trial window before paying.",
    agentChecks: [
      "Subscription confirmed past the trial window",
      "Referred account is genuinely active",
      "No repeat trials from the same person",
      "Your own approval record",
    ],
    counts: "A referred user starts a paid subscription and passes the trial period.",
    rules: ["Free trial does not count — the subscription must convert", "Any channel is fine, including video and email"],
    notAllowed: ["Coupon or deal sites", "Trial abuse"],
    attributionDays: 14,
    promoters: 22,
    totalPaid: 552_000_000,
    approvalRate: 0.88,
    medianPayoutSeconds: 1.4,
    businessSince: "May 2026",
    businessCampaigns: 1,
    businessDisputes: 0,
  },
};

/** Sensible defaults so every campaign has a usable detail page. */
export function detailFor(id: number): CampaignDetail {
  return (
    details[id] ?? {
      category: "Fintech",
      kind: "web2" as const,
      verification:
        "This business reports conversions to Vane through a verified integration. The falcon checks each claim against wallet history and behaviour before releasing money, and the bonded deposit covers disputes.",
      agentChecks: [
        "Result traced to your referral link",
        "Account shows real activity afterwards",
        "No cluster of accounts created together",
        "Your own approval record",
      ],
      counts: "A verified result as defined by the business when they funded this campaign.",
      rules: ["Share your link with a genuine audience", "Describe the product accurately"],
      notAllowed: ["Incentivised signups", "Self-referral"],
      attributionDays: 30,
      promoters: 12,
      totalPaid: 40_000_000,
      approvalRate: 0.91,
      medianPayoutSeconds: 1.3,
      businessSince: "2026",
      businessCampaigns: 1,
      businessDisputes: 0,
    }
  );
}

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
      return "of every referred trade";
    case "subscription":
      return "per subscription";
    case "post":
      return "per approved post";
    case "review":
      return "per verified review";
    case "mint":
      return "per verified mint";
  }
}

/** All active campaigns, one list — the marketplace's inventory. */
export const allCampaigns: Campaign[] = [...campaigns, ...moreCampaigns];

export function campaignById(id: number): Campaign | undefined {
  return allCampaigns.find((c) => c.id === id);
}

/** The signed-in tasker. Their numbers are derived from `performance` so the
 *  account page and the earnings dashboard always agree. */
export const me = {
  name: "Tunde Adeyemi",
  handle: "@tunde",
  since: "April 2026",
  avatar: "https://randomuser.me/api/portraits/men/32.jpg",
  reputation: 96, // 0–100, drives verification speed
  streak: 12, // consecutive approved results
};

/** A business as a findable entity, not a table row. */
export interface BusinessProfile {
  slug: string;
  name: string;
  initial: string;
  colour: string;
  blurb: string;
  kind: "web2" | "web3";
  bonded: boolean;
  since: string;
  totalFunded: number;
  totalPaid: number;
  approvalRate: number;
  disputes: number;
  campaignIds: number[];
}

export const businesses: BusinessProfile[] = [
  {
    slug: "nova-exchange", name: "Nova Exchange", initial: "N", colour: "#8f5a3e", blurb: "Onchain trading platform",
    kind: "web3", bonded: true, since: "January 2026", totalFunded: 5_000_000_000, totalPaid: 820_000_000,
    approvalRate: 0.97, disputes: 1, campaignIds: [2],
  },
  {
    slug: "lumen", name: "Lumen", initial: "L", colour: "#3e6b8f", blurb: "Savings app",
    kind: "web2", bonded: false, since: "March 2026", totalFunded: 500_000_000, totalPaid: 158_000_000,
    approvalRate: 0.93, disputes: 0, campaignIds: [1],
  },
  {
    slug: "peakform", name: "Peakform", initial: "P", colour: "#5a7a4e", blurb: "Fitness app",
    kind: "web2", bonded: false, since: "May 2026", totalFunded: 800_000_000, totalPaid: 552_000_000,
    approvalRate: 0.88, disputes: 0, campaignIds: [3],
  },
];

export function businessBySlug(slug: string): BusinessProfile | undefined {
  return businesses.find((b) => b.slug === slug);
}

export function slugFor(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

export const INDUSTRIES: Industry[] = Array.from(new Set(allCampaigns.map((c) => c.industry))).sort() as Industry[];

export type SortKey = "top" | "payout" | "ending" | "newest" | "taken";

export const SORTS: { id: SortKey; label: string }[] = [
  { id: "top", label: "Best match" },
  { id: "payout", label: "Highest paying" },
  { id: "ending", label: "Ending soon" },
  { id: "taken", label: "Most taken" },
  { id: "newest", label: "Newest" },
];

export function sortCampaigns(list: Campaign[], key: SortKey): Campaign[] {
  const s = [...list];
  switch (key) {
    case "payout":
      return s.sort((a, b) => b.rewardPerAction - a.rewardPerAction);
    case "ending":
      return s.sort((a, b) => a.endsAt - b.endsAt);
    case "taken":
      return s.sort((a, b) => b.taken - a.taken);
    case "newest":
      return s.sort((a, b) => b.id - a.id);
    default:
      return s.sort((a, b) => b.taken * remaining(b) - a.taken * remaining(a));
  }
}
