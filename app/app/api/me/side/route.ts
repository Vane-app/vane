import { NextResponse } from "next/server";
import { getUser, updateUser } from "../../../../lib/store";
import { currentUserId } from "../../../../lib/session";

/**
 * POST /api/me/side — add the other half of the marketplace to this account.
 *
 * Switching to a side you had not joined sent you through onboarding: it asked for
 * your email again, made you verify a code again, and offered to create a wallet you
 * already had. Everything it asked for was already known.
 *
 * Vane is one account with two sides — the whole point is that the person promoting
 * campaigns and the person running them can be the same person. So adding a side is
 * exactly what it sounds like: the account gains it. There is nothing to collect.
 *
 * The business side is the one exception, and it is not handled here: a business needs
 * a name and a logo before it can appear in a marketplace, so that keeps a short form.
 * It still reuses the email, the wallet and the verified domain.
 */
export async function POST(req: Request) {
  const uid = await currentUserId();
  if (!uid) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const user = await getUser(uid);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const side = body.side === "business" ? "business" : "tasker";

  if (user.role === "both" || user.role === side) {
    return NextResponse.json({ role: user.role, added: false });
  }

  const updated = await updateUser(uid, { role: "both" });
  return NextResponse.json({ role: updated?.role ?? "both", added: true });
}
