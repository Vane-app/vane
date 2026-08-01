import { NextResponse } from "next/server";
import { updateUser, getUser } from "../../../lib/store";
import { currentUserId } from "../../../lib/session";
import type { Industry } from "../../../lib/data";

/**
 * PUT /api/profile — save onboarding preferences.
 *
 * The strengths a tasker picks here drive recommendations in Browse. Requires a
 * session (created at sign-up).
 */
export async function PUT(req: Request) {
  const uid = await currentUserId();
  if (!uid || !await getUser(uid)) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (Array.isArray(b.strengths)) patch.strengths = b.strengths as Industry[];
  if (Array.isArray(b.channels)) patch.channels = b.channels.map(String);
  if (Array.isArray(b.socials)) patch.socials = b.socials.map(String);
  if (typeof b.name === "string") patch.name = b.name;
  if (typeof b.avatar === "string") patch.avatar = b.avatar;

  const u = await updateUser(uid, patch);
  return NextResponse.json({ ok: true, strengths: u?.strengths ?? [] });
}
