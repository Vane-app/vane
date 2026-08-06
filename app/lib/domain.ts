import { createHmac } from "node:crypto";
import { resolveTxt } from "node:dns/promises";

/**
 * Proving a business controls the brand it is advertising.
 *
 * Anyone could sign up as "Coinbase", upload their logo and post a campaign. The
 * escrow means they cannot steal — the budget is locked and payouts go to the sealed
 * tasker regardless — but the damage lands elsewhere: promoters share a fake to their
 * own audience, and a real brand's name is used without them.
 *
 * So the test is control, not paperwork. A business claims a domain and proves it
 * holds the keys to it, the same way every certificate authority and mail provider
 * does. No documents, no review queue, nothing for us to sit in the middle of — which
 * is the only kind of verification that belongs in a marketplace like this.
 *
 * Two routes, because different businesses have access to different things:
 *   a file at https://<domain>/.well-known/vane-verification.txt
 *   a DNS TXT record  vane-verification=<token>
 *
 * The token is derived, not stored: an HMAC of the account and the domain under the
 * session secret. It is stable for that pair, unguessable without the secret, and
 * cannot be replayed against a different account or a different domain.
 */

const WELL_KNOWN = "/.well-known/vane-verification.txt";
const DNS_PREFIX = "vane-verification=";

export function tokenFor(userId: string, domain: string): string {
  const secret = process.env.SESSION_SECRET ?? "vane-dev-secret-change-me";
  return createHmac("sha256", secret).update(`${userId}:${normalise(domain)}`).digest("hex").slice(0, 32);
}

/**
 * Reduce a domain to the thing we will actually check.
 *
 * People paste "https://www.acme.com/about" when they mean "acme.com". Accepting that
 * and normalising is kinder than rejecting it, and it stops the same business
 * verifying twice under two spellings.
 */
export function normalise(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "");
  d = d.split("/")[0];
  d = d.split("?")[0];
  d = d.replace(/^www\./, "");
  return d;
}

export function isPlausibleDomain(domain: string): boolean {
  // A hostname with at least one dot and no spaces. Deliberately loose — the real
  // test is whether they can prove control, not whether it matches a regex.
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(domain) && !domain.includes("..");
}

export interface VerifyOutcome {
  verified: boolean;
  method?: "file" | "dns";
  detail: string;
}

/**
 * Check a claim. Never throws — a DNS timeout or an unreachable site is "not verified
 * yet", not an error the user has to interpret.
 */
export async function verifyDomain(userId: string, rawDomain: string): Promise<VerifyOutcome> {
  const domain = normalise(rawDomain);
  if (!isPlausibleDomain(domain)) {
    return { verified: false, detail: "That doesn't look like a domain." };
  }

  const token = tokenFor(userId, domain);

  // File first: it propagates immediately, where DNS can take minutes to hours.
  try {
    const res = await fetch(`https://${domain}${WELL_KNOWN}`, {
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const body = (await res.text()).trim();
      if (body.includes(token)) {
        return { verified: true, method: "file", detail: `Verified via ${domain}${WELL_KNOWN}` };
      }
    }
  } catch {
    // Unreachable, no HTTPS, timed out. Fall through to DNS.
  }

  try {
    const records = await resolveTxt(domain);
    const flat = records.map((r) => r.join("")).map((r) => r.trim());
    if (flat.some((r) => r === `${DNS_PREFIX}${token}` || r === token)) {
      return { verified: true, method: "dns", detail: `Verified via DNS TXT on ${domain}` };
    }
  } catch {
    // No TXT records, or the domain does not resolve.
  }

  return {
    verified: false,
    detail: "Couldn't find the token yet. DNS changes can take a few minutes to propagate.",
  };
}

/** What to show the business so they can complete the proof. */
export function instructionsFor(userId: string, rawDomain: string) {
  const domain = normalise(rawDomain);
  const token = tokenFor(userId, domain);
  return {
    domain,
    token,
    file: { path: WELL_KNOWN, url: `https://${domain}${WELL_KNOWN}`, contents: token },
    dns: { type: "TXT", host: domain, value: `${DNS_PREFIX}${token}` },
  };
}
