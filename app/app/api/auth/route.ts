import { NextResponse } from "next/server";
import { createUser, updateUser, findUserByEmail, type User } from "../../../lib/store";
import { setSession, clearSession } from "../../../lib/session";

/**
 * POST /api/auth — sign up or log in with an email.
 *
 * No password: the wallet is the identity. On first sight of an email we create
 * the user and a Circle wallet (or a demo wallet when Circle isn't configured),
 * then set a signed session cookie. Returning users just get a fresh session.
 *
 * Body: { email, role?, name?, avatar? }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim();
  if (!/.+@.+\..+/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  const existing = await findUserByEmail(email);
  const isNew = !existing;

  // Only an explicit role means "I am joining this side". Logging in sends no role at
  // all, and must never change what someone already is.
  const wanted: "tasker" | "business" | null =
    body.role === "business" ? "business" : body.role === "tasker" ? "tasker" : null;

  const user = await createUser(email, wanted ?? "tasker");

  // One account, two sides. Coming back through the other front door promotes the
  // account to "both" rather than overwriting — a person who promotes campaigns and
  // also advertises their own is one user, not two. `createUser` returns the existing
  // record untouched, so the role has to be reconciled here.
  if (existing && wanted && existing.role !== wanted && existing.role !== "both") {
    await updateUser(existing.id, { role: "both" });
  }

  // Deliberately no wallet here. Signing up must not mint a wallet Vane controls —
  // that would make us a custodian of the user's earnings before they have agreed to
  // anything. The wallet is created in onboarding, by the user, against a keyshare we
  // never see. See lib/circle-user.ts.
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
