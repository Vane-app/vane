import { config as loadEnv } from "dotenv";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

loadEnv({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

/**
 * Does the thing we built actually work?
 *
 *   npm run check                    against a local dev server
 *   npm run check -- <url>           against a deployment
 *
 * Everything here is exercised through the same HTTP surface the browser uses, so a
 * pass means the product works and not merely that it compiles. Each check states
 * what it proves, because a green tick nobody understands is worth very little.
 *
 * What this cannot cover: anything behind a PIN. Setting up a wallet, taking a
 * campaign and funding an escrow all require a human approving in Circle's iframe —
 * by design, since that is the property that makes the wallets non-custodial. Those
 * are listed at the end as explicitly unverified rather than quietly skipped.
 */

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");

const results = [];
let failed = 0;

async function check(name, proves, fn) {
  try {
    const detail = await fn();
    results.push({ ok: true, name, proves, detail: detail ?? "" });
  } catch (err) {
    failed++;
    results.push({ ok: false, name, proves, detail: err.message });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** A cookie jar, so a session survives between calls the way a browser's would. */
function jar() {
  let cookie = "";
  return {
    get cookie() {
      return cookie;
    },
    async fetch(path, init = {}) {
      const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) },
        redirect: "manual",
      });
      const set = res.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0];
      return res;
    },
  };
}

/** Sign in the way the app does: email, then the code it returns. */
async function signIn(session, email, role) {
  const asked = await session.fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const sent = await asked.json();
  assert(sent.sent, "asking for a code did not work");
  assert(!sent.user, "asking for a code should not create a session");
  assert(sent.devCode, "no code returned — is an email provider configured?");

  const done = await session.fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code: sent.devCode, role }),
  });
  const out = await done.json();
  assert(done.ok && out.user, `verifying the code failed: ${out.error ?? done.status}`);
  return out.user;
}

const stamp = Date.now();
const biz = jar();
const other = jar();

/**
 * Clean up after ourselves.
 *
 * This created a real campaign on every run and left it there. Against production that
 * meant nine "SmokeCo" listings sitting in the live marketplace, indistinguishable
 * from real work to anyone browsing. A check that leaves debris in the thing it is
 * checking is not a check.
 */
const cleanup = [];

// ---------------------------------------------------------------- the checks

await check("Configuration", "every key, contract address and the falcon's balance are in place", async () => {
  const d = await (await fetch(`${BASE}/api/preflight`)).json();
  const bad = (d.checks ?? []).filter((c) => !c.ok);
  assert(d.ready, `${bad.length} failing: ${bad.map((c) => c.name).join(", ")}`);
  return `${d.checks.length} checks`;
});

await check("An email alone cannot sign you in", "the impersonation hole is closed", async () => {
  const s = jar();
  const res = await s.fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `probe-${stamp}@vane.test` }),
  });
  const d = await res.json();
  assert(!d.user, "an email alone returned a session");
  const me = await (await s.fetch("/api/me")).json();
  assert(!me.user, "an email alone created a usable session");
  return "code required";
});

await check("A wrong code is refused", "codes are actually checked", async () => {
  const s = jar();
  await s.fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `wrong-${stamp}@vane.test` }),
  });
  const res = await s.fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `wrong-${stamp}@vane.test`, code: "000000" }),
  });
  assert(res.status === 401, `expected 401, got ${res.status}`);
  return "rejected";
});

await check("Signing up and signing in", "the code flow works end to end", async () => {
  const user = await signIn(biz, `biz-${stamp}@vane.test`, "business");
  assert(user.walletAddress === "", "signup created a wallet — it must not, that would be custody");
  return user.email;
});

await check("A session persists", "accounts survive in Postgres, not memory", async () => {
  const me = await (await biz.fetch("/api/me")).json();
  assert(me.user, "the session did not survive");
  return me.user.email;
});

let campaignId = null;

await check("Posting a campaign", "a business can list work", async () => {
  const res = await biz.fetch("/api/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      business: `SmokeCo ${stamp}`,
      rewardPerAction: 500_000,
      budget: 4_000_000,
      durationDays: 7,
      blurb: "Someone signs up and makes a first deposit",
    }),
  });
  const d = await res.json();
  assert(res.ok && d.campaign, `posting failed: ${d.error ?? res.status}`);
  campaignId = d.campaign.id;
  cleanup.push(() =>
    biz.fetch(`/api/campaigns/${campaignId}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "end" }),
    }),
  );
  return `#${campaignId}`;
});

await check("It reaches the marketplace", "a posted campaign is findable", async () => {
  const d = await (await fetch(`${BASE}/api/campaigns`)).json();
  assert(d.campaigns.some((c) => c.id === campaignId), "the campaign is not in the feed");
  return `${d.campaigns.length} live`;
});

await check("Campaign detail resolves", "a listing shows its own data", async () => {
  const d = await (await fetch(`${BASE}/api/campaigns/${campaignId}`)).json();
  assert(d.campaign?.id === campaignId, "wrong campaign returned");
  return d.campaign.business;
});

await check("An unknown campaign 404s", "it cannot impersonate a different listing", async () => {
  const res = await fetch(`${BASE}/api/campaigns/9999999`);
  assert(res.status === 404, `expected 404, got ${res.status}`);
  return "404";
});

await check("The dashboard is scoped to its owner", "nobody sees another business's money", async () => {
  const mine = await (await biz.fetch("/api/business")).json();
  assert(mine.campaigns.some((c) => c.id === campaignId), "my campaign is missing from my dashboard");

  await signIn(other, `other-${stamp}@vane.test`, "business");
  const theirs = await (await other.fetch("/api/business")).json();
  assert(!theirs.campaigns.some((c) => c.id === campaignId), "another account can see my campaign");
  return "isolated";
});

await check("Only the owner can control a campaign", "a stranger cannot pause your work", async () => {
  const res = await other.fetch(`/api/campaigns/${campaignId}/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "pause" }),
  });
  assert(res.status === 403, `expected 403, got ${res.status}`);
  return "refused";
});

await check("Pausing hides a campaign", "a business can stop new work", async () => {
  const res = await biz.fetch(`/api/campaigns/${campaignId}/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "pause" }),
  });
  const d = await res.json();
  assert(d.campaign?.status === "paused", "status did not change");

  const feed = await (await fetch(`${BASE}/api/campaigns`)).json();
  assert(!feed.campaigns.some((c) => c.id === campaignId), "a paused campaign is still listed");

  const mine = await (await biz.fetch("/api/business")).json();
  assert(mine.campaigns.some((c) => c.id === campaignId), "a paused campaign vanished from its own dashboard");

  await biz.fetch(`/api/campaigns/${campaignId}/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "resume" }),
  });
  return "hidden, then resumed";
});

await check("Conversions cannot be forged", "the payout endpoint is not open", async () => {
  const res = await fetch(`${BASE}/api/conversion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refCode: "anything" }),
  });
  assert(res.status === 401 || res.status === 503, `an unsigned conversion returned ${res.status}`);
  return res.status === 503 ? "disabled" : "signature required";
});

await check("Domain verification refuses what it cannot prove", "the badge means something", async () => {
  const claim = await biz.fetch("/api/business/domain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain: "https://www.example.com/pricing" }),
  });
  const c = await claim.json();
  assert(c.domain === "example.com", `normalisation failed: ${c.domain}`);

  const verify = await (await biz.fetch("/api/business/domain", { method: "PUT" })).json();
  assert(!verify.verified, "verified a domain we do not control");
  return "claim ok, proof refused";
});

await check("Private pages need a session", "a stranger cannot open the app", async () => {
  for (const path of ["/business", "/post", "/earnings", "/campaigns"]) {
    const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
    assert(res.status === 307 || res.status === 302, `${path} served ${res.status} to nobody`);
  }
  return "redirected to sign in";
});

await check("A forged session is rejected", "the cookie signature is checked", async () => {
  const res = await fetch(`${BASE}/business`, {
    headers: { cookie: "vane_session=someone-elses-id.notarealsignature" },
    redirect: "manual",
  });
  assert(res.status === 307 || res.status === 302, `a forged cookie got ${res.status}`);
  return "refused";
});

await check("Login codes are never handed to the asker", "you cannot sign in as someone else", async () => {
  // This suite proved a forged session was refused, and passed for days while the app
  // gave out genuine ones: with no email provider configured, asking for a code
  // returned it in the response. Anyone who typed anyone's address was one POST from
  // their account. Checking that the front door is locked means nothing while the key
  // is taped to it.
  const res = await fetch(`${BASE}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `probe-${Date.now()}@example.com` }),
  });
  const body = await res.json().catch(() => ({}));

  // On a developer machine showing the code is the intended behaviour — there is no
  // inbox to send it to. Anywhere reachable over the network it is a live credential.
  const local = /localhost|127\.0\.0\.1/.test(BASE);
  assert(local || !body.devCode, "the login code came back in the response body");
  // A 502 here is the honest failure — mail is misconfigured, and it refused rather
  // than falling back to something insecure. Either is a pass; a leaked code is not.
  assert(res.ok || res.status === 502, `asking for a code returned ${res.status}`);
  return res.ok ? "emailed, not returned" : "refused to leak it";
});

await check("Discovery stays public", "a marketplace is browsable before joining", async () => {
  for (const path of ["/", "/tasks", "/login"]) {
    const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
    assert(res.status === 200, `${path} returned ${res.status}`);
  }
  return "open";
});

await check("Earnings start empty", "no fabricated balances", async () => {
  const d = await (await biz.fetch("/api/earnings")).json();
  assert(d.available === 0 && d.results === 0, `a new account has ${d.available} earned`);
  return "zeroed";
});

await check("The falcon's decisions read off Arc", "settlements and refusals come from the chain", async () => {
  const d = await (await fetch(`${BASE}/api/decisions`)).json();
  assert(d.configured, "no escrow configured");
  assert(!d.error, d.error ?? "");
  return d.scanning ? `scanning, ${d.indexed} so far` : `${d.indexed} indexed`;
});

// Take the test campaign back out of the marketplace before reporting.
for (const undo of cleanup) {
  await undo().catch(() => {});
}

// ----------------------------------------------------------------- reporting

console.log(`\n  Vane — checking ${BASE}\n`);
for (const r of results) {
  console.log(`  ${r.ok ? "ok  " : "FAIL"}  ${r.name}`);
  console.log(`        ${r.ok ? r.proves : r.detail}`);
}

console.log(`\n  ${results.length - failed}/${results.length} passed\n`);

console.log("  Not covered here — these need a person, by design:");
console.log("    · setting a wallet PIN            Circle's iframe, so the keyshare never reaches us");
console.log("    · funding an escrow               the business signs it, not Vane");
console.log("    · taking a campaign               the tasker signs the referral claim");
console.log("    · a settlement moving real USDC   run: npm run e2e -w @vane/contracts\n");

process.exit(failed ? 1 : 0);
