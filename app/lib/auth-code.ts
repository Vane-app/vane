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

/**
 * Whether a code may be shown on screen instead of emailed.
 *
 * Only ever true on a developer's own machine. Vercel sets NODE_ENV=production for
 * preview deployments as well as the live one, so nothing that is reachable over the
 * internet can take this path — which is the entire point. Deployed with no email
 * provider, `POST /api/auth` returned the code in its own response body, so anyone who
 * typed anyone's address was handed a working login. That is the impersonation hole
 * this module exists to close, arriving through the back door.
 */
const MAY_SHOW_CODE = process.env.NODE_ENV !== "production";

/**
 * Addresses that get their code on screen instead of by email.
 *
 * Sending real mail needs a verified domain, which this project does not have, so a
 * stranger with a real inbox cannot sign up. Judges still have to be able to walk the
 * whole thing — wallet, campaign, settlement — without waiting on an email that will
 * never arrive.
 *
 * `demo.vane` is not a real top-level domain, so no mail can ever reach it and no
 * address here belongs to anybody. Showing the code for these costs nothing: there is
 * no account to take over that was not created by whoever is looking at the screen.
 * Every other address still has to prove it by email.
 *
 * Each guest gets their own address, and so their own account and their own wallet. A
 * single shared demo login would have died at the first PIN — Circle's keyshare belongs
 * to the person who set it, so the second judge to arrive would have found a wallet
 * they could not open.
 */
export const DEMO_EMAIL_DOMAIN = "demo.vane";

export const isDemoAddress = (email: string) =>
  email.toLowerCase().trim().endsWith(`@${DEMO_EMAIL_DOMAIN}`);

export interface IssuedCode {
  /** The code itself, on a developer machine with no provider wired. Never in production. */
  devCode?: string;
  /** False when the code could not be emailed — the caller must not pretend it was sent. */
  delivered: boolean;
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

  // A demo address has no inbox by design, so the code goes to the screen and that
  // counts as delivered — there is nothing failing and nothing to report.
  if (isDemoAddress(key)) {
    return { devCode: code, delivered: true, expiresInSeconds: TTL_SECONDS };
  }

  const delivered = await deliver(key, code);
  return {
    // On a developer machine with no provider wired there is nowhere for the code to
    // go, so it comes back and the UI shows it. Anywhere deployed, an undelivered code
    // is a failure to report — never a code to hand out.
    devCode: !delivered && MAY_SHOW_CODE ? code : undefined,
    delivered,
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
 * Send the code. Returns false when it could not be delivered.
 *
 * Resend is used when RESEND_API_KEY is set. The code is logged only on a developer
 * machine: deployment logs are readable by anyone with dashboard access, so printing a
 * live credential there would just move the leak somewhere quieter.
 *
 * LOGIN_EMAIL_FROM must be an address at a domain verified with Resend. The default
 * test sender only delivers to the Resend account holder, so leaving it unset means
 * everyone else silently fails to receive anything.
 */
async function deliver(email: string, code: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.LOGIN_EMAIL_FROM ?? "Vane <onboarding@resend.dev>";

  if (!apiKey) {
    if (MAY_SHOW_CODE) console.log(`[vane] login code for ${email}: ${code}`);
    else console.error("[vane] RESEND_API_KEY is not set — nobody can sign in.");
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
        text: `Your Vane sign-in code is ${code}. It expires in 10 minutes.\n\nIf you didn't ask for this, you can ignore it — it was not enough to sign anyone in on its own.`,
        html: codeEmail(code),
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    return true;
  } catch (err) {
    console.error("[vane] could not email the login code:", (err as Error).message);
    if (MAY_SHOW_CODE) console.log(`[vane] login code for ${email}: ${code}`);
    return false;
  }
}

/** Plain, legible, and no images — so it renders the same everywhere and lands in inboxes. */
function codeEmail(code: string) {
  return `<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;max-width:420px;margin:0 auto;padding:32px 24px;color:#1a1614">
  <p style="font-size:19px;font-weight:700;letter-spacing:-.03em;margin:0 0 28px">vane</p>
  <p style="font-size:15px;line-height:1.5;margin:0 0 20px">Here is your sign-in code.</p>
  <p style="font-size:34px;font-weight:700;letter-spacing:.14em;margin:0 0 20px;font-variant-numeric:tabular-nums">${code}</p>
  <p style="font-size:13.5px;line-height:1.55;color:#6b625c;margin:0">It expires in 10 minutes and can be used once. If you didn&rsquo;t ask for it, you can ignore this — on its own it isn&rsquo;t enough to sign anyone in.</p>
</div>`;
}
