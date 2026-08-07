import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runPass } from "@vane/agent/pass";

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
