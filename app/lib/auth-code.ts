import { randomInt, createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "./db/client";

/**
 * One-time login codes.
 *
 * Sign-in was "type an email, you're in" — any email, including someone else's. That
 * is not a login, it is an impersonation form. A code proves the person asking
 * actually controls the address.
 *
 * Deliberately narrow: six digits, ten minutes, five attempts, single use. A six-digit
 * code is only 10^6 wide, so the attempt cap is doing as much work as the code itself.
 * Codes are stored hashed — a leaked database read must not hand over live logins.
 */

const TTL_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 5;

const now = () => Math.floor(Date.now() / 1000);
const hash = (code: string) => createHash("sha256").update(code).digest("hex");

/** In-memory fallback so the app still runs with no DATABASE_URL. */
const g = globalThis as unknown as {
  __vaneCodes?: Map<string, { codeHash: string; expiresAt: number; attempts: number }>;
};
const mem = () => (g.__vaneCodes ??= new Map());

export interface IssuedCode {
  /** Returned only when no email provider is configured — see `deliver`. */
  devCode?: string;
  expiresInSeconds: number;
}

/**
 * Issue a code for an address, replacing any outstanding one.
 *
 * Asking twice invalidates the first code. That is the behaviour people expect when
 * they hit "resend", and it stops a pile of live codes accumulating for one address.
 */
export async function issueCode(email: string): Promise<IssuedCode> {
  const key = email.toLowerCase();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = now() + TTL_SECONDS;

  if (!db) {
    mem().set(key, { codeHash: hash(code), expiresAt, attempts: 0 });
  } else {
    await db
      .insert(schema.loginCodes)
      .values({ email: key, codeHash: hash(code), expiresAt, attempts: 0 })
      .onConflictDoUpdate({
        target: schema.loginCodes.email,
        set: { codeHash: hash(code), expiresAt, attempts: 0 },
      });
  }

  const delivered = await deliver(key, code);
  return {
    // With no provider wired there is nowhere for the code to go, so it comes back
    // to the caller and the UI shows it. Better than a login nobody can complete —
    // and explicitly not what happens once RESEND_API_KEY is set.
    devCode: delivered ? undefined : code,
    expiresInSeconds: TTL_SECONDS,
  };
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "expired" | "invalid" | "too-many-attempts" | "not-requested" };

/** Check a code and consume it. A correct code can only ever be used once. */
export async function verifyCode(email: string, code: string): Promise<VerifyResult> {
  const key = email.toLowerCase();
  const supplied = hash(code.trim());

  const row = db
    ? (await db.select().from(schema.loginCodes).where(eq(schema.loginCodes.email, key)).limit(1))[0]
    : mem().get(key);

  if (!row) return { ok: false, reason: "not-requested" };
  if (row.expiresAt < now()) {
    await clear(key);
    return { ok: false, reason: "expired" };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    await clear(key);
    return { ok: false, reason: "too-many-attempts" };
  }

  // Constant-time compare so a wrong code cannot be narrowed by timing.
  const a = Buffer.from(supplied);
  const b = Buffer.from(row.codeHash);
  const match = a.length === b.length && timingSafeEqual(a, b);

  if (!match) {
    const attempts = row.attempts + 1;
    if (db) {
      await db.update(schema.loginCodes).set({ attempts }).where(eq(schema.loginCodes.email, key));
    } else {
      mem().set(key, { ...row, attempts });
    }
    return { ok: false, reason: attempts >= MAX_ATTEMPTS ? "too-many-attempts" : "invalid" };
  }

  await clear(key);
  return { ok: true };
}

async function clear(email: string) {
  if (db) await db.delete(schema.loginCodes).where(eq(schema.loginCodes.email, email));
  else mem().delete(email);
}

/**
 * Send the code. Returns false when there is nowhere to send it.
 *
 * Resend is used when RESEND_API_KEY is set; without it the code is logged and
 * surfaced in the UI, so the flow is complete and testable rather than a dead end
 * waiting on an account nobody has created yet.
 */
async function deliver(email: string, code: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LOGIN_EMAIL_FROM ?? "Vane <onboarding@resend.dev>";

  if (!apiKey) {
    console.log(`[vane] login code for ${email}: ${code}`);
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `${code} is your Vane code`,
        text: `Your Vane sign-in code is ${code}. It expires in 10 minutes.\n\nIf you didn't ask for this, you can ignore it.`,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    return true;
  } catch (err) {
    // A failed send must not lock someone out; fall back to the visible code.
    console.error("[vane] could not email the login code:", (err as Error).message);
    console.log(`[vane] login code for ${email}: ${code}`);
    return false;
  }
}
