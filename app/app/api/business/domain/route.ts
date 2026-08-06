import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getUser } from "../../../../lib/store";
import { db, schema } from "../../../../lib/db/client";
import { currentUserId } from "../../../../lib/session";
import { instructionsFor, verifyDomain, normalise, isPlausibleDomain } from "../../../../lib/domain";

/**
 * Claiming and proving a domain.
 *
 *   GET  — the current claim and, if unproven, how to prove it
 *   POST { domain }  — claim one
 *   PUT  — run the check
 *
 * Verification is never required to post. A business that has not proved a domain can
 * still run campaigns; its listings simply do not carry the badge, and promoters can
 * see that. Gating the marketplace behind verification would keep out exactly the
 * small businesses this is for, while doing nothing that the badge does not already
 * do — the point is to make impersonation visible, not to run a review queue.
 */

async function readClaim(userId: string) {
  if (!db) return { domain: "", verifiedAt: null as number | null };
  const [row] = await db
    .select({ domain: schema.users.domain, verifiedAt: schema.users.domainVerifiedAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return { domain: row?.domain ?? "", verifiedAt: row?.verifiedAt ?? null };
}

export async function GET() {
  const uid = await currentUserId();
  if (!uid || !(await getUser(uid))) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const claim = await readClaim(uid);
  return NextResponse.json({
    domain: claim.domain,
    verified: Boolean(claim.verifiedAt),
    verifiedAt: claim.verifiedAt,
    instructions: claim.domain && !claim.verifiedAt ? instructionsFor(uid, claim.domain) : null,
  });
}

export async function POST(req: Request) {
  const uid = await currentUserId();
  if (!uid || !(await getUser(uid))) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!db) return NextResponse.json({ error: "No database configured." }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const domain = normalise(String(body.domain ?? ""));
  if (!isPlausibleDomain(domain)) {
    return NextResponse.json({ error: "That doesn't look like a domain." }, { status: 400 });
  }

  // Claiming a different domain drops any previous proof — the badge must always
  // refer to the domain currently shown, never to one proved earlier.
  await db
    .update(schema.users)
    .set({ domain, domainVerifiedAt: null })
    .where(eq(schema.users.id, uid));

  return NextResponse.json({ domain, verified: false, instructions: instructionsFor(uid, domain) });
}

export async function PUT() {
  const uid = await currentUserId();
  if (!uid || !(await getUser(uid))) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!db) return NextResponse.json({ error: "No database configured." }, { status: 503 });

  const claim = await readClaim(uid);
  if (!claim.domain) return NextResponse.json({ error: "Claim a domain first." }, { status: 400 });

  const outcome = await verifyDomain(uid, claim.domain);
  if (!outcome.verified) {
    return NextResponse.json({ verified: false, detail: outcome.detail, instructions: instructionsFor(uid, claim.domain) });
  }

  const now = Math.floor(Date.now() / 1000);
  await db.update(schema.users).set({ domainVerifiedAt: now }).where(eq(schema.users.id, uid));

  // Backfill campaigns already posted, so proving a domain applies to work already
  // running rather than only to the next thing they post.
  await db
    .update(schema.campaigns)
    .set({ verifiedDomain: claim.domain })
    .where(eq(schema.campaigns.ownerId, uid));

  return NextResponse.json({ verified: true, domain: claim.domain, method: outcome.method, detail: outcome.detail });
}
