/**
 * The repository.
 *
 * A single interface the API routes use for every read and write. Backed by Postgres
 * when DATABASE_URL is set, and by a seeded in-memory store when it is not — so the
 * app and the scripts still run with no database, and the demo never breaks.
 *
 * Every function is async, including the in-memory branch. That is deliberate: a
 * repository whose signature changes with its backend forces every caller to know
 * which one is live. Money is in 6-decimal USDC base units throughout, matching the
 * contracts.
 *
 * The in-memory branch cannot survive serverless. Each cold start gets fresh memory,
 * so a deployed app without DATABASE_URL loses every account between requests — which
 * is exactly why this exists.
 */

import { randomUUID } from "node:crypto";
import { eq, and, inArray } from "drizzle-orm";
import { db, schema } from "./db/client";
import { allCampaigns, type Campaign, type Industry, type TaskType } from "./data";

export interface User {
  id: string;
  email: string;
  role: "tasker" | "business" | "both";
  name: string;
  avatar: string;
  walletId: string;
  walletAddress: string;
  /** Circle's id for this person, once they have signed in with Circle's email OTP. */
  circleUserId?: string;
  reputation: number;
  strengths: Industry[];
  channels: string[];
  socials: string[];
  createdAt: number;
}

export interface Take {
  id: string;
  campaignId: number;
  userId: string;
  refCode: string;
  clicks: number;
  results: number;
  earned: number;
  takenAt: number;
}

interface Store {
  users: Map<string, User>;
  emailIndex: Map<string, string>;
  campaigns: Map<number, Campaign>;
  takes: Take[];
  nextCampaignId: number;
}

const g = globalThis as unknown as { __vaneStore?: Store; __vaneSeeded?: boolean };

function init(): Store {
  const campaigns = new Map<number, Campaign>();
  for (const c of allCampaigns) campaigns.set(c.id, { ...c });
  return {
    users: new Map(),
    emailIndex: new Map(),
    campaigns,
    takes: [],
    nextCampaignId: Math.max(...allCampaigns.map((c) => c.id)) + 1,
  };
}

function mem(): Store {
  if (!g.__vaneStore) g.__vaneStore = init();
  return g.__vaneStore;
}

const DAY = 86_400;
const now = () => Math.floor(Date.now() / 1000);
const secs = (d: Date | null | undefined) => (d ? Math.floor(d.getTime() / 1000) : now());

// ------------------------------------------------------------------- mapping

type CampaignRow = typeof schema.campaigns.$inferSelect;

function toCampaign(r: CampaignRow): Campaign {
  return {
    id: r.id,
    ownerId: r.ownerId ?? undefined,
    business: r.business,
    blurb: r.blurb,
    initial: r.initial,
    colour: r.colour,
    logoUrl: r.logoUrl || undefined,
    verifiedDomain: r.verifiedDomain || undefined,
    bonded: r.bonded,
    rewardPerAction: r.rewardPerAction,
    budget: r.budget,
    spent: r.spent,
    endsAt: r.endsAt,
    kind: r.kind as Campaign["kind"],
    streaming: r.streaming,
    // Postgres returns '' for the empty column, and '' is not nullish — so a
    // plain ?? kept it and blanked the payout figure on every card.
    rateLabel: r.rateLabel || undefined,
    status: r.status as Campaign["status"],
    taskType: r.taskType as TaskType,
    industry: r.industry as Industry,
    effort: r.effort as Campaign["effort"],
    web3: r.web3,
    taken: r.taken,
    escrowCampaignId: r.escrowCampaignId ?? undefined,
  };
}

/**
 * Put the bundled campaigns in the database once, so a fresh deployment has a
 * marketplace rather than an empty grid. Seeded rows have no ownerId, so they never
 * appear on anyone's business dashboard.
 */
async function seedIfEmpty() {
  if (!db || g.__vaneSeeded) return;
  g.__vaneSeeded = true;
  const existing = await db.select({ id: schema.campaigns.id }).from(schema.campaigns).limit(1);
  if (existing.length) return;

  await db.insert(schema.campaigns).values(
    allCampaigns.map((c) => ({
      business: c.business,
      blurb: c.blurb ?? "",
      initial: c.initial,
      colour: c.colour,
      bonded: c.bonded,
      web3: c.web3,
      kind: c.kind,
      taskType: c.taskType,
      industry: c.industry,
      rewardPerAction: c.rewardPerAction,
      budget: c.budget,
      spent: c.spent,
      effort: c.effort,
      streaming: c.streaming,
      rateLabel: c.rateLabel ?? "",
      endsAt: c.endsAt,
      status: c.status,
      taken: c.taken,
    })),
  );
}

// --------------------------------------------------------------------- users

/**
 * Find the account Circle's login belongs to.
 *
 * Identity, as opposed to `findUserByEmail`, which is a lookup by label. Circle
 * verifies an address and hands back a user id without ever telling us which address
 * it verified — so the browser's claim about the email is not evidence of anything,
 * while holding this id means having passed the OTP.
 */
export async function findUserByCircleId(circleUserId: string): Promise<User | undefined> {
  if (!db) {
    for (const u of mem().users.values()) if (u.circleUserId === circleUserId) return u;
    return undefined;
  }
  const [u] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.circleUserId, circleUserId))
    .limit(1);
  return u ? await hydrate(u) : undefined;
}

/**
 * Bind a Circle login to an account, creating one if this is a first sign-in.
 *
 * An email that already exists without a Circle id is adopted rather than duplicated:
 * these are accounts made before Circle became the front door, and the person signing
 * in has just proved more about themselves than they ever did originally.
 */
export async function linkCircleUser(
  circleUserId: string,
  email: string,
  role: User["role"] = "tasker",
): Promise<{ user: User; isNew: boolean }> {
  const existing = await findUserByCircleId(circleUserId);
  if (existing) return { user: existing, isNew: false };

  const byEmail = await findUserByEmail(email);
  if (byEmail) {
    const updated = await updateUser(byEmail.id, { circleUserId });
    return { user: updated ?? byEmail, isNew: false };
  }

  const created = await createUser(email, role);
  const updated = await updateUser(created.id, { circleUserId });
  return { user: updated ?? created, isNew: true };
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const key = email.toLowerCase();
  if (!db) {
    const id = mem().emailIndex.get(key);
    return id ? mem().users.get(id) : undefined;
  }
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, key)).limit(1);
  return u ? await hydrate(u) : undefined;
}

export async function getUser(id: string): Promise<User | undefined> {
  if (!db) return mem().users.get(id);
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return u ? await hydrate(u) : undefined;
}

async function hydrate(u: typeof schema.users.$inferSelect): Promise<User> {
  const [p] = db
    ? await db.select().from(schema.profiles).where(eq(schema.profiles.userId, u.id)).limit(1)
    : [];
  return {
    id: u.id,
    email: u.email,
    role: u.role as User["role"],
    name: u.name ?? "",
    avatar: u.avatarUrl ?? "",
    walletId: u.walletId ?? "",
    walletAddress: u.walletAddress ?? "",
    circleUserId: u.circleUserId ?? undefined,
    reputation: u.reputation,
    strengths: (p?.strengths ?? []) as Industry[],
    channels: p?.channels ?? [],
    socials: p?.socials ?? [],
    createdAt: secs(u.createdAt),
  };
}

export async function createUser(email: string, role: User["role"] = "tasker"): Promise<User> {
  const existing = await findUserByEmail(email);
  if (existing) return existing;

  const user: User = {
    id: randomUUID(),
    email: email.toLowerCase(),
    role,
    name: "",
    avatar: "",
    walletId: "",
    walletAddress: "",
    reputation: 80,
    strengths: [],
    channels: [],
    socials: [],
    createdAt: now(),
  };

  if (!db) {
    mem().users.set(user.id, user);
    mem().emailIndex.set(user.email, user.id);
    return user;
  }

  await db.insert(schema.users).values({
    id: user.id,
    email: user.email,
    role: user.role,
    name: "",
    avatarUrl: "",
    walletId: "",
    walletAddress: "",
    reputation: 80,
  });
  return user;
}

export async function updateUser(id: string, patch: Partial<User>): Promise<User | undefined> {
  if (!db) {
    const u = mem().users.get(id);
    if (!u) return undefined;
    Object.assign(u, patch);
    return u;
  }

  const cols: Partial<typeof schema.users.$inferInsert> = {};
  if (patch.role !== undefined) cols.role = patch.role;
  if (patch.name !== undefined) cols.name = patch.name;
  if (patch.avatar !== undefined) cols.avatarUrl = patch.avatar;
  if (patch.walletId !== undefined) cols.walletId = patch.walletId;
  if (patch.walletAddress !== undefined) cols.walletAddress = patch.walletAddress;
  if (patch.reputation !== undefined) cols.reputation = patch.reputation;
  if (patch.circleUserId !== undefined) cols.circleUserId = patch.circleUserId;
  if (Object.keys(cols).length) {
    await db.update(schema.users).set(cols).where(eq(schema.users.id, id));
  }

  // Profile arrays live in their own table; upsert so a first save works.
  if (patch.strengths || patch.channels || patch.socials) {
    await db
      .insert(schema.profiles)
      .values({
        userId: id,
        strengths: patch.strengths ?? [],
        channels: patch.channels ?? [],
        socials: patch.socials ?? [],
      })
      .onConflictDoUpdate({
        target: schema.profiles.userId,
        set: {
          ...(patch.strengths ? { strengths: patch.strengths } : {}),
          ...(patch.channels ? { channels: patch.channels } : {}),
          ...(patch.socials ? { socials: patch.socials } : {}),
        },
      });
  }

  return getUser(id);
}

// ----------------------------------------------------------------- campaigns

/**
 * What the marketplace shows.
 *
 * Active is not the same as fundable. A business could post a campaign, never approve
 * the two transactions that lock the budget, and the listing appeared anyway — with a
 * rate, a budget and nothing behind it. A promoter could take it and share a link that
 * no escrow could ever settle, which is the same dead end from the other side.
 *
 * So a campaign reaches the marketplace once Arc says its budget is locked, and not
 * before. `escrowCampaignId` is only written after `/confirm` has read the escrow back
 * off the chain, so it is evidence rather than intent.
 *
 * Skipped entirely when no escrow is deployed — a local checkout with no contracts has
 * nothing to confirm against, and an empty marketplace there would be a worse lie than
 * an unfunded one.
 */
export async function listCampaigns(): Promise<Campaign[]> {
  const requireFunding = Boolean(process.env.VANE_ESCROW_ADDRESS);

  if (!db) {
    return [...mem().campaigns.values()].filter(
      (c) => c.status === "active" && (!requireFunding || c.escrowCampaignId),
    );
  }
  await seedIfEmpty();
  const rows = await db.select().from(schema.campaigns).where(eq(schema.campaigns.status, "active"));
  return rows.map(toCampaign).filter((c) => !requireFunding || c.escrowCampaignId);
}

export async function getCampaign(id: number): Promise<Campaign | undefined> {
  if (!db) return mem().campaigns.get(id);
  await seedIfEmpty();
  const [r] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, id)).limit(1);
  return r ? toCampaign(r) : undefined;
}

export async function createCampaign(input: {
  business: string;
  blurb: string;
  initial: string;
  colour: string;
  industry: Industry;
  taskType: TaskType;
  kind: string;
  rewardPerAction: number;
  budget: number;
  durationDays: number;
  bonded: boolean;
  ownerId?: string;
  logoUrl?: string;
  verifiedDomain?: string;
}): Promise<Campaign> {
  const endsAt = now() + input.durationDays * DAY;
  const kind = input.taskType === "referral" ? "signup" : input.taskType === "content" ? "post" : "signup";

  if (!db) {
    const s = mem();
    const id = s.nextCampaignId++;
    const c: Campaign = {
      id,
      ownerId: input.ownerId,
      business: input.business,
      blurb: input.blurb,
      initial: input.initial,
      colour: input.colour,
      logoUrl: input.logoUrl,
      verifiedDomain: input.verifiedDomain,
      bonded: input.bonded,
      rewardPerAction: input.rewardPerAction,
      budget: input.budget,
      spent: 0,
      endsAt,
      kind,
      streaming: false,
      status: "active",
      taskType: input.taskType,
      industry: input.industry,
      effort: "medium",
      web3: input.kind === "web3",
      taken: 0,
    };
    s.campaigns.set(id, c);
    return c;
  }

  await seedIfEmpty();
  const [r] = await db
    .insert(schema.campaigns)
    .values({
      ownerId: input.ownerId ?? null,
      business: input.business,
      blurb: input.blurb,
      initial: input.initial,
      colour: input.colour,
      logoUrl: input.logoUrl ?? "",
      verifiedDomain: input.verifiedDomain ?? "",
      bonded: input.bonded,
      web3: input.kind === "web3",
      kind,
      taskType: input.taskType,
      industry: input.industry,
      rewardPerAction: input.rewardPerAction,
      budget: input.budget,
      endsAt,
      status: "active",
    })
    .returning();

  return toCampaign(r);
}

/** Patch a campaign — used to bind a listing to its on-chain id once known. */
export async function updateCampaign(id: number, patch: Partial<Campaign>): Promise<Campaign | undefined> {
  if (!db) {
    const c = mem().campaigns.get(id);
    if (!c) return undefined;
    Object.assign(c, patch);
    return c;
  }

  const cols: Partial<typeof schema.campaigns.$inferInsert> = {};
  if (patch.escrowCampaignId !== undefined) cols.escrowCampaignId = patch.escrowCampaignId;
  if (patch.spent !== undefined) cols.spent = patch.spent;
  if (patch.status !== undefined) cols.status = patch.status;
  if (patch.taken !== undefined) cols.taken = patch.taken;
  if (patch.blurb !== undefined) cols.blurb = patch.blurb;
  if (!Object.keys(cols).length) return getCampaign(id);

  const [r] = await db.update(schema.campaigns).set(cols).where(eq(schema.campaigns.id, id)).returning();
  return r ? toCampaign(r) : undefined;
}

// --------------------------------------------------------------------- takes

export async function takeCampaign(userId: string, campaignId: number): Promise<Take> {
  const existing = await findTake(userId, campaignId);
  if (existing) return existing;

  const c = await getCampaign(campaignId);
  const user = await getUser(userId);
  const handle = (user?.name || user?.email || "you").split("@")[0].replace(/\s+/g, "").toLowerCase();
  const slug = (c?.business ?? "vane").toLowerCase().replace(/\s+/g, "");

  const take: Take = {
    id: randomUUID(),
    campaignId,
    userId,
    refCode: `${slug}-${handle}-${Math.random().toString(36).slice(2, 6)}`,
    clicks: 0,
    results: 0,
    earned: 0,
    takenAt: now(),
  };

  if (!db) {
    mem().takes.push(take);
    const mc = mem().campaigns.get(campaignId);
    if (mc) mc.taken += 1;
    return take;
  }

  await db.insert(schema.takes).values({
    id: take.id,
    campaignId,
    userId,
    refCode: take.refCode,
    clicks: 0,
    results: 0,
    earned: 0,
  });
  if (c) await updateCampaign(campaignId, { taken: c.taken + 1 });
  return take;
}

async function findTake(userId: string, campaignId: number): Promise<Take | undefined> {
  if (!db) return mem().takes.find((t) => t.userId === userId && t.campaignId === campaignId);
  const [r] = await db
    .select()
    .from(schema.takes)
    .where(and(eq(schema.takes.userId, userId), eq(schema.takes.campaignId, campaignId)))
    .limit(1);
  return r ? toTake(r) : undefined;
}

function toTake(r: typeof schema.takes.$inferSelect): Take {
  return {
    id: r.id,
    campaignId: r.campaignId,
    userId: r.userId,
    refCode: r.refCode,
    clicks: r.clicks,
    results: r.results,
    earned: r.earned,
    takenAt: secs(r.takenAt),
  };
}

export async function takesForUser(userId: string): Promise<Take[]> {
  if (!db) return mem().takes.filter((t) => t.userId === userId);
  const rows = await db.select().from(schema.takes).where(eq(schema.takes.userId, userId));
  return rows.map(toTake);
}

/** A business's own campaigns — what its dashboard is allowed to show. */
export async function campaignsForOwner(userId: string): Promise<Campaign[]> {
  // Every status, not just active: a business must still see a campaign it has
  // paused or ended. `listCampaigns` is the marketplace view and filters to active,
  // which would have made a paused campaign disappear from its owner's dashboard.
  if (!db) return [...mem().campaigns.values()].filter((c) => c.ownerId === userId);
  const rows = await db.select().from(schema.campaigns).where(eq(schema.campaigns.ownerId, userId));
  return rows.map(toCampaign);
}

/** Everyone who took a campaign, and how it has performed. Powers the dashboard. */
export async function takesForCampaign(campaignId: number): Promise<Take[]> {
  if (!db) return mem().takes.filter((t) => t.campaignId === campaignId);
  const rows = await db.select().from(schema.takes).where(eq(schema.takes.campaignId, campaignId));
  return rows.map(toTake);
}

/** Roll a business's campaigns up into the figures its dashboard leads with. */
export async function businessSummary(userId: string) {
  const campaigns = await campaignsForOwner(userId);
  const ids = campaigns.map((c) => c.id);

  let takes: Take[] = [];
  if (ids.length) {
    if (!db) {
      takes = mem().takes.filter((t) => ids.includes(t.campaignId));
    } else {
      // One query for every campaign, rather than one per campaign.
      const rows = await db.select().from(schema.takes).where(inArray(schema.takes.campaignId, ids));
      takes = rows.map(toTake);
    }
  }

  return {
    campaigns,
    /**
     * Only budgets Arc has actually locked.
     *
     * This summed every campaign's requested budget, so a business that filled in the
     * form and never approved the two funding transactions saw "$5.00 locked in
     * escrow" on its dashboard. Nothing was locked. The number a business trusts most
     * was the one describing money that had not moved.
     */
    locked: campaigns.reduce((s, c) => s + (c.escrowCampaignId ? c.budget : 0), 0),
    spent: campaigns.reduce((s, c) => s + c.spent, 0),
    results: takes.reduce((s, t) => s + t.results, 0),
    clicks: takes.reduce((s, t) => s + t.clicks, 0),
    promoters: new Set(takes.map((t) => t.userId)).size,
  };
}

export async function findTakeByCode(refCode: string): Promise<Take | undefined> {
  if (!db) return mem().takes.find((t) => t.refCode === refCode);
  const [r] = await db.select().from(schema.takes).where(eq(schema.takes.refCode, refCode)).limit(1);
  return r ? toTake(r) : undefined;
}

export async function recordClick(refCode: string): Promise<Take | undefined> {
  const t = await findTakeByCode(refCode);
  if (!t) return undefined;
  if (!db) {
    const m = mem().takes.find((x) => x.refCode === refCode);
    if (m) m.clicks += 1;
    return m;
  }
  const [r] = await db
    .update(schema.takes)
    .set({ clicks: t.clicks + 1 })
    .where(eq(schema.takes.refCode, refCode))
    .returning();
  return r ? toTake(r) : undefined;
}

/** Credit a verified result to a take — called after the agent settles. */
export async function creditResult(refCode: string, amount: number): Promise<void> {
  const t = await findTakeByCode(refCode);
  if (!t) return;

  if (!db) {
    const m = mem().takes.find((x) => x.refCode === refCode);
    if (m) {
      m.results += 1;
      m.earned += amount;
    }
    const c = mem().campaigns.get(t.campaignId);
    if (c) c.spent += amount;
    return;
  }

  await db
    .update(schema.takes)
    .set({ results: t.results + 1, earned: t.earned + amount })
    .where(eq(schema.takes.refCode, refCode));

  const c = await getCampaign(t.campaignId);
  if (c) await updateCampaign(c.id, { spent: c.spent + amount });
}

// ------------------------------------------------------------------ earnings

export async function earningsFor(userId: string) {
  const takes = await takesForUser(userId);
  return {
    available: takes.reduce((s, t) => s + t.earned, 0),
    results: takes.reduce((s, t) => s + t.results, 0),
    clicks: takes.reduce((s, t) => s + t.clicks, 0),
    takes,
  };
}
