import {
  pgTable,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  serial,
  real,
} from "drizzle-orm/pg-core";

/**
 * The Vane data model.
 *
 * Money columns are 6-decimal USDC base units (bigint), the same view the
 * contracts use. This schema is the source of truth when DATABASE_URL is set;
 * the in-memory store (../store.ts) mirrors these shapes for the demo fallback.
 *
 * Apply with:  npx drizzle-kit push
 */

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("tasker"), // tasker | business | both
  name: text("name").default(""),
  avatarUrl: text("avatar_url").default(""),
  walletId: text("wallet_id").default(""),
  walletAddress: text("wallet_address").default(""),
  reputation: integer("reputation").notNull().default(80),
  /** The domain this business claims, and when it last proved control of it.
   *  Proof is control of the domain itself — see lib/domain.ts. */
  domain: text("domain").default(""),
  domainVerifiedAt: bigint("domain_verified_at", { mode: "number" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const profiles = pgTable("profiles", {
  userId: text("user_id").primaryKey(),
  strengths: jsonb("strengths").$type<string[]>().default([]),
  channels: jsonb("channels").$type<string[]>().default([]),
  socials: jsonb("socials").$type<string[]>().default([]),
});

export const businesses = pgTable("businesses", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url").default(""),
  industry: text("industry").notNull(),
  kind: text("kind").notNull().default("web2"), // web2 | web3
  bond: bigint("bond", { mode: "number" }).notNull().default(0),
  bonded: boolean("bonded").notNull().default(false),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Campaigns.
 *
 * Columns mirror the `Campaign` type the UI already renders, so a campaign
 * round-trips through Postgres unchanged. The earlier draft of this table predated
 * that type and would have dropped the business name, colour, bonded flag and
 * ownership on write — a listing that came back from the database looking like a
 * different campaign than the one that was posted.
 */
export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  /** The account that posted it. Null on the seeded set, which belongs to nobody. */
  ownerId: text("owner_id"),
  business: text("business").notNull(),
  blurb: text("blurb").notNull().default(""),
  initial: text("initial").notNull().default("V"),
  colour: text("colour").notNull().default("#3e6b8f"),
  /** The business's own logo. Falls back to the coloured initial when absent. */
  logoUrl: text("logo_url").default(""),
  /** Snapshot of the owner's proved domain, so a card can show it without a join. */
  verifiedDomain: text("verified_domain").default(""),
  bonded: boolean("bonded").notNull().default(false),
  web3: boolean("web3").notNull().default(false),
  /** The paid event: signup | post | trade … */
  kind: text("kind").notNull().default("signup"),
  taskType: text("task_type").notNull(), // referral | content | onchain | bounty
  industry: text("industry").notNull(),
  rewardPerAction: bigint("reward_per_action", { mode: "number" }).notNull(),
  budget: bigint("budget", { mode: "number" }).notNull(),
  spent: bigint("spent", { mode: "number" }).notNull().default(0),
  effort: text("effort").notNull().default("medium"),
  streaming: boolean("streaming").notNull().default(false),
  rateLabel: text("rate_label").default(""),
  endsAt: bigint("ends_at", { mode: "number" }).notNull(),
  status: text("status").notNull().default("active"),
  /** The id inside VaneEscrow, once funding has confirmed on Arc. */
  escrowCampaignId: bigint("escrow_campaign_id", { mode: "number" }),
  bannerUrl: text("banner_url").default(""),
  taken: integer("taken").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const takes = pgTable("takes", {
  id: text("id").primaryKey(),
  campaignId: integer("campaign_id").notNull(),
  userId: text("user_id").notNull(),
  refCode: text("ref_code").notNull().unique(),
  sealedTx: text("sealed_tx").default(""),
  clicks: integer("clicks").notNull().default(0),
  results: integer("results").notNull().default(0),
  earned: bigint("earned", { mode: "number" }).notNull().default(0),
  takenAt: timestamp("taken_at").notNull().defaultNow(),
});

export const conversions = pgTable("conversions", {
  id: text("id").primaryKey(),
  takeId: text("take_id").notNull(),
  campaignId: integer("campaign_id").notNull(),
  wallet: text("wallet").notNull(),
  actionIndex: integer("action_index").notNull(),
  kind: text("kind").notNull(),
  evidence: text("evidence").default(""),
  at: timestamp("at").notNull().defaultNow(),
});

export const decisions = pgTable("decisions", {
  id: text("id").primaryKey(),
  conversionId: text("conversion_id").notNull(),
  campaignId: integer("campaign_id").notNull(),
  verdict: text("verdict").notNull(), // settled | held
  risk: real("risk").notNull().default(0),
  reason: text("reason").notNull(),
  amount: bigint("amount", { mode: "number" }).notNull().default(0),
  fee: bigint("fee", { mode: "number" }).notNull().default(0),
  txHash: text("tx_hash").default(""),
  decidedAt: timestamp("decided_at").notNull().defaultNow(),
});

/**
 * One-time login codes.
 *
 * Sign-in used to be "type an email, you're in" — any email, including someone
 * else's. A code proves the person asking actually controls the address.
 *
 * Rows are short-lived and single-use: consumed on success, and expired rows are
 * meaningless. `attempts` caps guessing, since a 6-digit code is only 10^6 wide.
 */
export const loginCodes = pgTable("login_codes", {
  email: text("email").primaryKey(),
  codeHash: text("code_hash").notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
