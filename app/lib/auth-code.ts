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

/**
 * How often one address may be sent a code, and how many any one caller may trigger.
 *
 * Asking for a code sends an email, and nothing limited how often anyone could ask.
 * Twenty requests went through in under three seconds. Pointed at a stranger's inbox
 * that is an email bomb sent by us; pointed anywhere it burns a daily sending quota
 * the whole product depends on, and earns the sending account a spam reputation it
 * cannot easily lose.
 *
 * The per-address cooldown is the important one — it makes bombing a specific person
 * impossible regardless of where the requests come from. The per-caller cap is best
 * effort: serverless instances do not share memory, so it slows a flood rather than
 * stopping it, which is still the difference between a nuisance and a quota gone.
 */
const RESEND_COOLDOWN_SECONDS = 45;
const MAX_SENDS_PER_CALLER_PER_HOUR = 12;

const now = () => Math.floor(Date.now() / 1000);
const hash = (code: string) => createHash("sha256").update(code).digest("hex");

/** In-memory fallback so the app still runs with no DATABASE_URL. */
const g = globalThis as unknown as {
  __vaneCodes?: Map<string, { codeHash: string; expiresAt: number; attempts: number }>;
  __vaneSends?: Map<string, number[]>;
};
const mem = () => (g.__vaneCodes ??= new Map());
const sends = () => (g.__vaneSends ??= new Map());

/** True when this caller has asked for too many codes in the last hour. */
export function callerIsFlooding(caller: string): boolean {
  const cutoff = now() - 3600;
  const recent = (sends().get(caller) ?? []).filter((t: number) => t > cutoff);
  sends().set(caller, recent);
  if (recent.length >= MAX_SENDS_PER_CALLER_PER_HOUR) return true;
  recent.push(now());
  return false;
}

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

export type IssueRefusal = { refused: "too-soon"; retryInSeconds: number };

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
export async function issueCode(email: string): Promise<IssuedCode | IssueRefusal> {
  const key = email.toLowerCase();

  // One address, one code every so often — whatever the caller looks like.
  const existing = db
    ? (await db.select().from(schema.loginCodes).where(eq(schema.loginCodes.email, key)).limit(1))[0]
    : mem().get(key);
  if (existing) {
    const issuedAt = existing.expiresAt - TTL_SECONDS;
    const since = now() - issuedAt;
    if (since < RESEND_COOLDOWN_SECONDS) {
      return { refused: "too-soon", retryInSeconds: RESEND_COOLDOWN_SECONDS - since };
    }
  }

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
 * Sent over SMTP, which is what makes this work at all. Resend would only deliver to
 * the account holder without a domain proved by DNS, and the domain in question runs
 * another product whose nameservers were not worth moving for a login email. An SMTP
 * account has no such requirement — it will send to anybody.
 *
 * The code is logged only on a developer machine: deployment logs are readable by
 * anyone with dashboard access, so printing a live credential there would move the
 * leak somewhere quieter rather than close it.
 */
async function deliver(email: string, code: string): Promise<boolean> {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.LOGIN_EMAIL_FROM ?? (user ? `Vane <${user}>` : "");

  if (!user || !pass) {
    if (MAY_SHOW_CODE) console.log(`[vane] login code for ${email}: ${code}`);
    else console.error("[vane] SMTP_USER/SMTP_PASS are not set — nobody can sign in.");
    return false;
  }

  try {
    const nodemailer = (await import("nodemailer")).default;
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: false, // STARTTLS on 587, which is what Gmail expects
      auth: { user, pass },
    });

    await transport.sendMail({
      from,
      to: email,
      replyTo: user,
      /**
       * The code is out of the subject line deliberately.
       *
       * "643012 is your Vane code" is the shape of every credential-phishing email a
       * filter has ever been trained on, and this is being sent from a consumer mailbox
       * with no domain behind it — the sender has nothing to vouch for it, so the
       * content is all the filter has to go on. It landed in spam.
       */
      subject: "Your Vane sign-in code",
      text: `Your Vane sign-in code is ${code}

It expires in 10 minutes and can be used once.

If you didn't ask for this, you can ignore it. On its own it is not enough to sign anyone in, and nobody at Vane will ever ask you for it.

Vane`,
      html: codeEmail(code),
      headers: {
        // Marks this as transactional rather than bulk, and tells Gmail there is no
        // list to unsubscribe from — a missing List-Unsubscribe on mail that looks
        // like marketing counts against it.
        "X-Entity-Ref-ID": String(Date.now()),
        Precedence: "transactional",
      },
    });
    return true;
  } catch (err) {
    console.error("[vane] could not email the login code:", (err as Error).message);
    if (MAY_SHOW_CODE) console.log(`[vane] login code for ${email}: ${code}`);
    return false;
  }
}

/**
 * The email itself.
 *
 * Tables and bgcolor attributes rather than styled divs: Gmail drops background
 * properties on block elements but honours the attribute, which is why the first
 * version of this arrived as black text on white with the code the same size as the
 * body copy. No images either, so nothing has to load and nothing can fail to.
 */
function codeEmail(code: string) {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a1218" style="background-color:#0a1218;margin:0;padding:0;">
<tr><td align="center" style="padding:36px 16px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#111c24" style="max-width:430px;background-color:#111c24;border-radius:14px;">
<tr><td style="padding:34px 30px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<p style="margin:0 0 28px;font-size:20px;font-weight:bold;color:#f3f6f7;">vane</p>
<p style="margin:0 0 20px;font-size:19px;font-weight:bold;color:#f3f6f7;">Your sign-in code</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a1218" style="background-color:#0a1218;border-radius:10px;">
<tr><td align="center" style="padding:20px 10px;">
<span style="font-family:'Courier New',Courier,monospace;font-size:32px;font-weight:bold;color:#f0a94b;letter-spacing:8px;">${code}</span>
</td></tr>
</table>
<p style="margin:22px 0 10px;font-size:14px;line-height:21px;color:#9aa9b2;">Expires in 10 minutes and can be used once.</p>
<p style="margin:0;font-size:14px;line-height:21px;color:#9aa9b2;">If you didn&rsquo;t ask for this, ignore it &mdash; on its own it isn&rsquo;t enough to sign anyone in.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:30px;">
<tr><td style="border-top:1px solid #223039;padding-top:16px;">
<p style="margin:0;font-size:12px;line-height:18px;color:#6d7d87;">Vane never asks for your PIN, seed phrase or private key.</p>
</td></tr></table>
</td></tr></table>
</td></tr></table>`;
}
