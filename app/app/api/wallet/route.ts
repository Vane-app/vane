import { NextResponse } from "next/server";
import { currentUserId } from "../../../lib/session";
import { getUser, updateUser } from "../../../lib/store";
import { startSession, userWalletsConfigured } from "../../../lib/circle-user";

/**
 * GET /api/wallet — begin a user-controlled wallet session.
 *
 * Returns the short-lived Circle session token the browser SDK needs, plus whether
 * this user already has a wallet. The token is scoped to one user and expires in an
 * hour; it lets the browser talk to Circle directly so the user's PIN and keyshare
 * never pass through Vane.
 *
 * When Circle isn't configured the app still works — it reports `configured: false`
 * and the UI falls back to the demo wallet, so the whole flow stays clickable.
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const user = getUser(userId);
  if (!user) return NextResponse.json({ error: "Unknown user." }, { status: 401 });

  if (!userWalletsConfigured) {
    return NextResponse.json({
      configured: false,
      ready: Boolean(user.walletAddress),
      address: user.walletAddress ?? null,
    });
  }

  try {
    const session = await startSession(userId);

    // Circle is the source of truth for the address; mirror it so the rest of the
    // app can read it without a round-trip.
    if (session.address && session.address !== user.walletAddress) {
      updateUser(userId, { walletAddress: session.address });
    }

    return NextResponse.json({
      configured: true,
      ready: session.ready,
      address: session.address ?? null,
      userToken: session.userToken,
      encryptionKey: session.encryptionKey,
      appId: session.appId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "Could not start a wallet session." },
      { status: 502 },
    );
  }
}
