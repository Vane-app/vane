"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginCodes = exports.decisions = exports.conversions = exports.takes = exports.campaigns = exports.businesses = exports.profiles = exports.users = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
/**
 * The Vane data model.
 *
 * Money columns are 6-decimal USDC base units (bigint), the same view the
 * contracts use. This schema is the source of truth when DATABASE_URL is set;
 * the in-memory store (../store.ts) mirrors these shapes for the demo fallback.
 *
 * Apply with:  npx drizzle-kit push
 */
exports.users = (0, pg_core_1.pgTable)("users", {
    id: (0, pg_core_1.text)("id").primaryKey(),
    email: (0, pg_core_1.text)("email").notNull().unique(),
    role: (0, pg_core_1.text)("role").notNull().default("tasker"), // tasker | business | both
    name: (0, pg_core_1.text)("name").default(""),
    avatarUrl: (0, pg_core_1.text)("avatar_url").default(""),
    walletId: (0, pg_core_1.text)("wallet_id").default(""),
    walletAddress: (0, pg_core_1.text)("wallet_address").default(""),
    reputation: (0, pg_core_1.integer)("reputation").notNull().default(80),
    /** The domain this business claims, and when it last proved control of it.
     *  Proof is control of the domain itself — see lib/domain.ts. */
    domain: (0, pg_core_1.text)("domain").default(""),
    domainVerifiedAt: (0, pg_core_1.bigint)("domain_verified_at", { mode: "number" }),
    createdAt: (0, pg_core_1.timestamp)("created_at").notNull().defaultNow(),
});
exports.profiles = (0, pg_core_1.pgTable)("profiles", {
    userId: (0, pg_core_1.text)("user_id").primaryKey(),
    strengths: (0, pg_core_1.jsonb)("strengths").$type().default([]),
    channels: (0, pg_core_1.jsonb)("channels").$type().default([]),
    socials: (0, pg_core_1.jsonb)("socials").$type().default([]),
});
exports.businesses = (0, pg_core_1.pgTable)("businesses", {
    id: (0, pg_core_1.text)("id").primaryKey(),
    userId: (0, pg_core_1.text)("user_id").notNull(),
    name: (0, pg_core_1.text)("name").notNull(),
    slug: (0, pg_core_1.text)("slug").notNull().unique(),
    logoUrl: (0, pg_core_1.text)("logo_url").default(""),
    industry: (0, pg_core_1.text)("industry").notNull(),
    kind: (0, pg_core_1.text)("kind").notNull().default("web2"), // web2 | web3
    bond: (0, pg_core_1.bigint)("bond", { mode: "number" }).notNull().default(0),
    bonded: (0, pg_core_1.boolean)("bonded").notNull().default(false),
    verified: (0, pg_core_1.boolean)("verified").notNull().default(false),
    createdAt: (0, pg_core_1.timestamp)("created_at").notNull().defaultNow(),
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
exports.campaigns = (0, pg_core_1.pgTable)("campaigns", {
    id: (0, pg_core_1.serial)("id").primaryKey(),
    /** The account that posted it. Null on the seeded set, which belongs to nobody. */
    ownerId: (0, pg_core_1.text)("owner_id"),
    business: (0, pg_core_1.text)("business").notNull(),
    blurb: (0, pg_core_1.text)("blurb").notNull().default(""),
    initial: (0, pg_core_1.text)("initial").notNull().default("V"),
    colour: (0, pg_core_1.text)("colour").notNull().default("#3e6b8f"),
    /** The business's own logo. Falls back to the coloured initial when absent. */
    logoUrl: (0, pg_core_1.text)("logo_url").default(""),
    /** Snapshot of the owner's proved domain, so a card can show it without a join. */
    verifiedDomain: (0, pg_core_1.text)("verified_domain").default(""),
    bonded: (0, pg_core_1.boolean)("bonded").notNull().default(false),
    web3: (0, pg_core_1.boolean)("web3").notNull().default(false),
    /** The paid event: signup | post | trade … */
    kind: (0, pg_core_1.text)("kind").notNull().default("signup"),
    taskType: (0, pg_core_1.text)("task_type").notNull(), // referral | content | onchain | bounty
    industry: (0, pg_core_1.text)("industry").notNull(),
    rewardPerAction: (0, pg_core_1.bigint)("reward_per_action", { mode: "number" }).notNull(),
    budget: (0, pg_core_1.bigint)("budget", { mode: "number" }).notNull(),
    spent: (0, pg_core_1.bigint)("spent", { mode: "number" }).notNull().default(0),
    effort: (0, pg_core_1.text)("effort").notNull().default("medium"),
    streaming: (0, pg_core_1.boolean)("streaming").notNull().default(false),
    rateLabel: (0, pg_core_1.text)("rate_label").default(""),
    endsAt: (0, pg_core_1.bigint)("ends_at", { mode: "number" }).notNull(),
    status: (0, pg_core_1.text)("status").notNull().default("active"),
    /** The id inside VaneEscrow, once funding has confirmed on Arc. */
    escrowCampaignId: (0, pg_core_1.bigint)("escrow_campaign_id", { mode: "number" }),
    bannerUrl: (0, pg_core_1.text)("banner_url").default(""),
    taken: (0, pg_core_1.integer)("taken").notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)("created_at").notNull().defaultNow(),
});
exports.takes = (0, pg_core_1.pgTable)("takes", {
    id: (0, pg_core_1.text)("id").primaryKey(),
    campaignId: (0, pg_core_1.integer)("campaign_id").notNull(),
    userId: (0, pg_core_1.text)("user_id").notNull(),
    refCode: (0, pg_core_1.text)("ref_code").notNull().unique(),
    sealedTx: (0, pg_core_1.text)("sealed_tx").default(""),
    clicks: (0, pg_core_1.integer)("clicks").notNull().default(0),
    results: (0, pg_core_1.integer)("results").notNull().default(0),
    earned: (0, pg_core_1.bigint)("earned", { mode: "number" }).notNull().default(0),
    takenAt: (0, pg_core_1.timestamp)("taken_at").notNull().defaultNow(),
});
exports.conversions = (0, pg_core_1.pgTable)("conversions", {
    id: (0, pg_core_1.text)("id").primaryKey(),
    takeId: (0, pg_core_1.text)("take_id").notNull(),
    campaignId: (0, pg_core_1.integer)("campaign_id").notNull(),
    wallet: (0, pg_core_1.text)("wallet").notNull(),
    actionIndex: (0, pg_core_1.integer)("action_index").notNull(),
    kind: (0, pg_core_1.text)("kind").notNull(),
    evidence: (0, pg_core_1.text)("evidence").default(""),
    at: (0, pg_core_1.timestamp)("at").notNull().defaultNow(),
});
exports.decisions = (0, pg_core_1.pgTable)("decisions", {
    id: (0, pg_core_1.text)("id").primaryKey(),
    conversionId: (0, pg_core_1.text)("conversion_id").notNull(),
    campaignId: (0, pg_core_1.integer)("campaign_id").notNull(),
    verdict: (0, pg_core_1.text)("verdict").notNull(), // settled | held
    risk: (0, pg_core_1.real)("risk").notNull().default(0),
    reason: (0, pg_core_1.text)("reason").notNull(),
    amount: (0, pg_core_1.bigint)("amount", { mode: "number" }).notNull().default(0),
    fee: (0, pg_core_1.bigint)("fee", { mode: "number" }).notNull().default(0),
    txHash: (0, pg_core_1.text)("tx_hash").default(""),
    decidedAt: (0, pg_core_1.timestamp)("decided_at").notNull().defaultNow(),
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
exports.loginCodes = (0, pg_core_1.pgTable)("login_codes", {
    email: (0, pg_core_1.text)("email").primaryKey(),
    codeHash: (0, pg_core_1.text)("code_hash").notNull(),
    expiresAt: (0, pg_core_1.bigint)("expires_at", { mode: "number" }).notNull(),
    attempts: (0, pg_core_1.integer)("attempts").notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)("created_at").notNull().defaultNow(),
});
