import { NextResponse } from "next/server";
import { currentUserId } from "../../../../lib/session";
import { createWalletChallenge, startSession, userWalletsConfigured } from "../../../../lib/circle-user";

/**
 * POST /api/wallet/create — ask Circle for a wallet-creation challenge.
 *
 * Returns a challengeId only. The browser SDK executes it, the user chooses a PIN,
 * and the wallet is created against a keyshare Vane never receives. This route
 * cannot create a wallet on its own, which is the property we want: nobody at Vane
 * can conjure a wallet for a user and then spend from it.
 */
export async function POST() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!userWalletsConfigured) {
    return NextResponse.json(
      { error: "Circle user-controlled wallets are not configured on this deployment." },
      { status: 503 },
    );
  }

  try {
    const session = await startSession(userId);
    if (session.ready) {
      return NextResponse.json({ alreadyExists: true, address: session.address });
    }

    const challengeId = await createWalletChallenge(session.userToken);
    return NextResponse.json({
      challengeId,
      userToken: session.userToken,
      encryptionKey: session.encryptionKey,
      appId: session.appId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "Could not start wallet creation." },
      { status: 502 },
    );
  }
}
