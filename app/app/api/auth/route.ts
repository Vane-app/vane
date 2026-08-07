import { NextResponse } from "next/server";
import { createUser, updateUser, findUserByEmail, getUser, type User } from "../../../lib/store";
import { setSession, clearSession, currentUserId } from "../../../lib/session";
import { issueCode, verifyCode, callerIsFlooding } from "../../../lib/auth-code";

/**
 * Sign in and sign up, in two steps.
 *
 * This route used to take an email and hand back a session. Any email — including
 * someone else's — logged you in as them. That is an impersonation form, not a login,
 * and on a product holding people's earnings it is the most serious thing here.
 *
 *   POST { email }                    → sends a code, creates nothing
 *   POST { email, code, role?, ... }  → verifies, then creates the account and session
 *
 * The account is only created once the code checks out, so nobody can fill the users
 * table with addresses they do not control.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim();
  if (!/.+@.+\..+/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  // --- step one: ask for a code -------------------------------------------
  if (!body.code) {
    const existing = await findUserByEmail(email);

    /**
     * Asking for a code sends an email, and nothing stopped anyone asking as fast as
     * they liked — twenty requests went through in under three seconds. Aimed at a
     * stranger's inbox that is an email bomb sent by us; aimed anywhere it burns the
     * daily sending quota the whole product runs on.
     */
    const caller =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (callerIsFlooding(caller)) {
      return NextResponse.json(
        { error: "Too many sign-in codes requested. Wait a few minutes." },
        { status: 429 },
      );
    }

    const issued = await issueCode(email);
    if ("refused" in issued) {
      return NextResponse.json(
        {
          error: `We just sent one. Check your inbox, or ask again in ${issued.retryInSeconds}s.`,
          retryInSeconds: issued.retryInSeconds,
        },
        { status: 429 },
      );
    }
    const { devCode, delivered, expiresInSeconds } = issued;

    // Undelivered and unshowable means the person is holding a code that exists only in
    // our database. Saying "check your inbox" would send them to wait for an email that
    // is never coming, so say what actually happened.
    if (!delivered && !devCode) {
      return NextResponse.json(
        { error: "We couldn't email that code. This is our problem, not yours — try again in a moment." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      sent: true,
      // Lets the UI say "welcome back" rather than "let's get you started". Only ever
      // returned to whoever is about to prove they hold the address.
      returning: Boolean(existing),
      expiresInSeconds,
      devCode,
    });
  }

  // --- step two: prove it --------------------------------------------------
  const result = await verifyCode(email, String(body.code));
  if (!result.ok) {
    const message =
      result.reason === "expired"
        ? "That code has expired — ask for a new one."
        : result.reason === "too-many-attempts"
          ? "Too many attempts. Ask for a new code."
          : result.reason === "not-requested"
            ? "Ask for a code first."
            : "That code isn't right.";
    return NextResponse.json({ error: message, reason: result.reason }, { status: 401 });
  }

  const existing = await findUserByEmail(email);
  const isNew = !existing;

  // Only an explicit role means "I am joining this side". Signing in sends no role at
  // all, and must never change what someone already is.
  const wanted: "tasker" | "business" | null =
    body.role === "business" ? "business" : body.role === "tasker" ? "tasker" : null;

  const user = await createUser(email, wanted ?? "tasker");

  // One account, two sides. Coming back through the other front door promotes the
  // account to "both" rather than overwriting — a person who promotes campaigns and
  // also advertises their own is one user, not two.
  if (existing && wanted && existing.role !== wanted && existing.role !== "both") {
    await updateUser(existing.id, { role: "both" });
  }

  // Deliberately no wallet here. Signing up must not mint a wallet Vane controls —
  // that would make us a custodian of the user's earnings before they have agreed to
  // anything. The wallet is created in onboarding, by the user. See lib/circle-user.ts.
  if (body.name || body.avatar) {
    await updateUser(user.id, {
      ...(body.name ? { name: String(body.name) } : {}),
      ...(body.avatar ? { avatar: String(body.avatar) } : {}),
    });
  }

  await setSession(user.id);
  const fresh = (await findUserByEmail(email)) ?? user;
  return NextResponse.json({ user: publicUser(fresh), isNew });
}

/**
 * PATCH — update the signed-in user's own profile.
 *
 * Onboarding saves a name and photo after the session exists. It used to do that by
 * re-POSTing here, which now demands a code, so it needs its own door. Reads the
 * session rather than an email, so it can only ever edit you.
 */
export async function PATCH(req: Request) {
  const id = await currentUserId();
  if (!id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const patch: Partial<User> = {};
  if (body.name !== undefined) patch.name = String(body.name);
  if (body.avatar !== undefined) patch.avatar = String(body.avatar);

  if (body.role === "business" || body.role === "tasker") {
    const me = await getUser(id);
    if (me && me.role !== body.role && me.role !== "both") patch.role = "both";
  }

  const updated = await updateUser(id, patch);
  return NextResponse.json({ user: updated ? publicUser(updated) : null });
}

export async function DELETE() {
  await clearSession();
  return NextResponse.json({ ok: true });
}

function publicUser(u: User) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    name: u.name,
    avatar: u.avatar,
    walletAddress: u.walletAddress,
    reputation: u.reputation,
    strengths: u.strengths,
  };
}
