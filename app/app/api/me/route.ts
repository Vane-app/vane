import { NextResponse } from "next/server";
import { getUser, earningsFor } from "../../../lib/store";
import { currentUserId } from "../../../lib/session";

/** GET /api/me — the signed-in user, their wallet, and their live earnings. */
export async function GET() {
  const id = await currentUserId();
  if (!id) return NextResponse.json({ user: null }, { status: 200 });

  const u = getUser(id);
  if (!u) return NextResponse.json({ user: null }, { status: 200 });

  const e = earningsFor(id);
  return NextResponse.json({
    user: {
      id: u.id,
      email: u.email,
      role: u.role,
      name: u.name,
      avatar: u.avatar,
      walletAddress: u.walletAddress,
      reputation: u.reputation,
      strengths: u.strengths,
      channels: u.channels,
    },
    earnings: { available: e.available, results: e.results, clicks: e.clicks },
  });
}
