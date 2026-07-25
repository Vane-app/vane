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

export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  businessId: text("business_id").notNull(),
  taskType: text("task_type").notNull(), // referral | content | onchain | bounty
  industry: text("industry").notNull(),
  title: text("title").notNull(),
  whatCounts: text("what_counts").notNull(),
  rewardPerAction: bigint("reward_per_action", { mode: "number" }).notNull(),
  budget: bigint("budget", { mode: "number" }).notNull(),
  spent: bigint("spent", { mode: "number" }).notNull().default(0),
  effort: text("effort").notNull().default("medium"),
  streaming: boolean("streaming").notNull().default(false),
  rateLabel: text("rate_label").default(""),
  endsAt: bigint("ends_at", { mode: "number" }).notNull(),
  status: text("status").notNull().default("active"),
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
