import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { linkCircleUser, updateUser } from "../../../../lib/store";
import { setSession } from "../../../../lib/session";

/**
 * Sign in with Circle's email OTP.
 *
 * Vane could not email anybody. Sending to an arbitrary address needs a domain proved
 * by DNS, there was none, and the fallback — showing the code on screen — is the
 * impersonation hole this app already had to close once. So the product was reachable
 * only through guest accounts, and anyone who typed their real address was told to
 * "try again in a moment", which was never going to work.
 *
 * Circle sends the mail instead. It already verifies addresses for wallet recovery, on
 * infrastructure that is somebody's full-time job, and this is the same login the
 * wallet is going to need anyway — so the two steps become one.
 *
 *   POST  { email, deviceId }              → Circle emails a code, we return the tokens
 *   PUT   { userToken, encryptionKey, … }  → we verify with Circle, then open a session
 *
 * Why it is split: the OTP is typed inside Circle's own UI, not ours. We never see the
 * code, which is the point — the same reason we never see the PIN.
 */

async function client() {
  // The SDK ships CJS and named imports do not survive the interop under tsx.
  const mod = await import("@circle-fin/user-controlled-wallets");
  const init = (mod as unknown as { initiateUserControlledWalletsClient: Function })
    .initiateUserControlledWalletsClient;
  return init({ apiKey: process.env.CIRCLE_API_KEY! });
}

/**
 * The app id, needed before anything else.
 *
 * The browser has to load Circle's SDK and read its device id before it can ask for a
 * code, and the SDK needs the app id to start — so this cannot wait for the sign-in
 * response that would otherwise carry it. Public by nature: it identifies the
 * application, holds no secret, and is visible in the modal Circle renders anyway.
 */
export async function GET() {
  const appId = process.env.CIRCLE_APP_ID;
  return NextResponse.json({ appId: appId ?? null, configured: Boolean(appId && process.env.CIRCLE_API_KEY) });
}

/** Step one: ask Circle to email a code to this address. */
export async function POST(req: Request) {
  if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_APP_ID) {
    return NextResponse.json({ error: "Circle sign-in is not configured." }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const deviceId = String(body.deviceId ?? "").trim();

  if (!/.+@.+\..+/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  // The device id comes from the SDK in the browser and binds the token to that
  // browser, so a token intercepted in transit is useless anywhere else.
  if (!deviceId) {
    return NextResponse.json({ error: "Missing device id." }, { status: 400 });
  }

  try {
    const c = await client();
    const res = await c.createDeviceTokenForEmailLogin({
      idempotencyKey: randomUUID(),
      deviceId,
      email,
    });

    const data = res?.data?.data ?? res?.data;
    if (!data?.deviceToken) throw new Error("Circle did not return a device token");

    return NextResponse.json({
      sent: true,
      deviceToken: data.deviceToken,
      deviceEncryptionKey: data.deviceEncryptionKey,
      appId: process.env.CIRCLE_APP_ID,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Could not send a code." },
      { status: 502 },
    );
  }
}

/**
 * Step two: the browser completed the OTP. Check that with Circle before believing it.
 *
 * The security of this whole route is here. A userToken arriving from the browser is a
 * claim, and `getUserByToken` is what turns it into a fact — it is rejected outright
 * unless Circle recognises it.
 *
 * The account is then keyed on the id Circle returns, never on the email in the
 * request. Circle verifies an address but does not tell us which one it verified, so
 * trusting the browser's word for it would mean anyone could finish a legitimate login
 * for their own address and then name somebody else's. Holding the id requires having
 * passed the OTP; the email is stored beside it as a label.
 */
export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const userToken = String(body.userToken ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const role = body.role === "business" ? "business" : body.role === "tasker" ? "tasker" : undefined;

  if (!userToken) return NextResponse.json({ error: "Missing user token." }, { status: 400 });

  try {
    const c = await client();
    // getUserStatus, not getUserByToken: the published types name a method the client
    // does not actually carry. Same trap as getContract on the contracts SDK — the
    // types are generated from a spec that runs ahead of the shipped client, so every
    // name here is worth checking against the runtime before trusting it.
    const res = await c.getUserStatus({ userToken });
    const circleUserId = res?.data?.user?.id ?? res?.data?.id;

    if (!circleUserId) {
      return NextResponse.json({ error: "Circle did not recognise that sign-in." }, { status: 401 });
    }

    const { user, isNew } = await linkCircleUser(circleUserId, email, role ?? "tasker");

    // One account, two sides: arriving through the other front door adds a side rather
    // than overwriting, because promoting campaigns and running them is one person.
    if (role && user.role !== role && user.role !== "both") {
      await updateUser(user.id, { role: "both" });
    }

    await setSession(user.id);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: role && user.role !== role && user.role !== "both" ? "both" : user.role,
        name: user.name,
        avatar: user.avatar,
        walletAddress: user.walletAddress,
      },
      isNew,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 401 });
  }
}
