import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runPass } from "@vane/agent/pass";
import { currentUserId } from "../../../../lib/session";

/**
 * GET /api/cron/settle — pay or hold everything that converted recently.
 *
 * The falcon's watch loop only ever ran on a developer's laptop, so the deployed app
 * could take a campaign, seal a referral and record a conversion on Arc, and then
 * nothing happened. Someone testing it did every step right and never got paid, with
 * no way to tell that the missing piece was a process nobody had started.
 *
 * Vercel invokes this on a schedule. It judges with the same `evaluate` the agent
 * runs — imported, not reimplemented — so a result cannot be paid here and refused
 * there.
 *
 * Also reachable by hand with the same secret, because "is the settler working" is a
 * question worth being able to answer in one request rather than by waiting for a
 * cron window.
 */

// Judging and settling several conversions means several round trips to Arc and to
// Circle. The default 15s would cut a pass off midway through paying somebody.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST — settle now, for whoever just converted.
 *
 * A Hobby plan runs cron once a day, which would mean converting on Arc and waiting
 * until three in the morning to be paid. That is not a demo, and more importantly it
 * is not the product: the claim is that verification is fast enough to settle while
 * the person is still looking at the screen.
 *
 * So the daily cron is the backstop, and the conversion itself is the trigger. Signed
 * in only, and it decides nothing on the caller's behalf — a pass judges whatever is
 * genuinely on the chain, which is the same work whoever asked for it. The worst a
 * caller can do by asking twice is spend a little gas, because a claim already handled
 * comes back to the same idempotency key.
 */
export async function POST() {
  if (!(await currentUserId())) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  try {
    // A short window: this is called moments after a conversion lands, and scanning
    // further back only slows down the reply the person is waiting for.
    const result = await runPass(400n);
    return NextResponse.json({
      ok: true,
      settled: result.handled.filter((h) => h.verdict !== "hold").length,
      held: result.handled.filter((h) => h.verdict === "hold").length,
      decisions: result.handled,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Left open, this endpoint spends real USDC on demand. Refusing is the only safe
    // default: a settler that never runs is a bug, one anyone can trigger is a hole.
    return NextResponse.json(
      { error: "CRON_SECRET is not set, so settlement is disabled." },
      { status: 503 },
    );
  }

  const provided = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  try {
    const result = await runPass();
    return NextResponse.json({
      ok: true,
      scanned: result.scanned,
      settled: result.handled.filter((h) => h.verdict !== "hold").length,
      held: result.handled.filter((h) => h.verdict === "hold").length,
      decisions: result.handled,
      errors: result.errors,
    });
  } catch (err) {
    // Report the failure rather than a quiet 200 — a cron that always looks fine is
    // indistinguishable from one that never runs.
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
