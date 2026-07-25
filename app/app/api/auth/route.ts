import { NextResponse } from "next/server";
import { createUser, updateUser, findUserByEmail } from "../../../lib/store";
import { createUserWallet } from "../../../lib/circle";
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

  const isNew = !findUserByEmail(email);
  const user = createUser(email, body.role ?? "tasker");

  if (isNew) {
    const wallet = await createUserWallet(user.id);
    updateUser(user.id, { walletId: wallet.walletId, walletAddress: wallet.address });
  }
  if (body.name || body.avatar) {
    updateUser(user.id, {
      ...(body.name ? { name: String(body.name) } : {}),
      ...(body.avatar ? { avatar: String(body.avatar) } : {}),
    });
  }

  await setSession(user.id);
  const fresh = findUserByEmail(email)!;
  return NextResponse.json({ user: publicUser(fresh), isNew });
}

export async function DELETE() {
  await clearSession();
  return NextResponse.json({ ok: true });
}

function publicUser(u: ReturnType<typeof createUser>) {
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
