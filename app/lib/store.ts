/**
 * The repository.
 *
 * A single interface the API routes use for every read and write. Today it is a
 * seeded in-memory store, so the whole app is interactive — sign up, post a
 * campaign, take one, get a referral link, watch earnings — with no database.
 *
 * When DATABASE_URL is set, the same functions are backed by Postgres (Drizzle);
 * the in-memory branch is the fallback so the demo never breaks. Money is in
 * 6-decimal USDC base units throughout, matching the contracts.
 */

import { randomUUID } from "node:crypto";
import { allCampaigns, businesses as seedBusinesses, type Campaign, type Industry, type TaskType } from "./data";

export interface User {
  id: string;
  email: string;
  role: "tasker" | "business" | "both";
  name: string;
  avatar: string;
  walletId: string;
  walletAddress: string;
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

// Module-level singleton so state persists across requests in one server.
const g = globalThis as unknown as { __vaneStore?: Store };

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

function store(): Store {
  if (!g.__vaneStore) g.__vaneStore = init();
  return g.__vaneStore;
}

const DAY = 86_400;
const now = () => Math.floor(Date.now() / 1000);

// ------------------------------------------------------------------- users

export function findUserByEmail(email: string): User | undefined {
  const id = store().emailIndex.get(email.toLowerCase());
  return id ? store().users.get(id) : undefined;
}

export function getUser(id: string): User | undefined {
  return store().users.get(id);
}

export function createUser(email: string, role: User["role"] = "tasker"): User {
  const existing = findUserByEmail(email);
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
  store().users.set(user.id, user);
  store().emailIndex.set(user.email, user.id);
  return user;
}

export function updateUser(id: string, patch: Partial<User>): User | undefined {
  const u = store().users.get(id);
  if (!u) return undefined;
  Object.assign(u, patch);
  return u;
}

// --------------------------------------------------------------- campaigns

export function listCampaigns(): Campaign[] {
  return [...store().campaigns.values()].filter((c) => c.status === "active");
}

export function getCampaign(id: number): Campaign | undefined {
  return store().campaigns.get(id);
}

export function createCampaign(input: {
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
}): Campaign {
  const s = store();
  const id = s.nextCampaignId++;
  const c: Campaign = {
    id,
    business: input.business,
    blurb: input.blurb,
    initial: input.initial,
    colour: input.colour,
    bonded: input.bonded,
    rewardPerAction: input.rewardPerAction,
    budget: input.budget,
    spent: 0,
    endsAt: now() + input.durationDays * DAY,
    kind: input.taskType === "referral" ? "signup" : input.taskType === "content" ? "post" : "signup",
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

// ------------------------------------------------------------------- takes

export function takeCampaign(userId: string, campaignId: number): Take {
  const s = store();
  const existing = s.takes.find((t) => t.userId === userId && t.campaignId === campaignId);
  if (existing) return existing;

  const c = s.campaigns.get(campaignId);
  const user = s.users.get(userId);
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
  s.takes.push(take);
  if (c) c.taken += 1;
  return take;
}

export function takesForUser(userId: string): Take[] {
  return store().takes.filter((t) => t.userId === userId);
}

export function findTakeByCode(refCode: string): Take | undefined {
  return store().takes.find((t) => t.refCode === refCode);
}

export function recordClick(refCode: string): Take | undefined {
  const t = findTakeByCode(refCode);
  if (t) t.clicks += 1;
  return t;
}

/** Credit a verified result to a take — called after the agent settles. */
export function creditResult(refCode: string, amount: number): void {
  const t = findTakeByCode(refCode);
  if (!t) return;
  t.results += 1;
  t.earned += amount;
  const c = store().campaigns.get(t.campaignId);
  if (c) c.spent += amount;
}

// ---------------------------------------------------------------- earnings

export function earningsFor(userId: string) {
  const takes = takesForUser(userId);
  const available = takes.reduce((s, t) => s + t.earned, 0);
  const results = takes.reduce((s, t) => s + t.results, 0);
  const clicks = takes.reduce((s, t) => s + t.clicks, 0);
  return { available, results, clicks, takes };
}
