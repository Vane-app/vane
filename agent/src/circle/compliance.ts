import { randomUUID } from "node:crypto";
import { config } from "../config.js";

/**
 * Circle Compliance Engine — address screening.
 *
 * The falcon's own engine answers a behavioural question: is this a real result, or a
 * farm? It reads attribution, wallet age, post-conversion activity, funding
 * concentration, clustering. What it cannot possibly know is whether an address is on
 * a sanctions list, or is a known ransomware wallet — that is not a pattern in the
 * data, it is a fact held in registries we do not have.
 *
 * So this is not a replacement for `decision.ts`. It answers the other half of the
 * question, and the two are combined in `evaluate()`:
 *
 *   decision.ts   is this result genuine?        heuristics, scored
 *   compliance    is this address safe to pay?   registries, gated
 *
 * The distinction matters in how a hit is treated. A behavioural signal is evidence
 * and gets weighed. A sanctions hit is not evidence, it is a prohibition — money must
 * not move, whatever the rest of the picture looks like. So it is a gate, not a score.
 *
 * Screening being unavailable is never treated as a pass. If we cannot check, we say
 * we could not check, and the decision log records that rather than implying a clean
 * result nobody verified.
 *
 * Verified live against ARC-TESTNET: a clean address returns APPROVED with an empty
 * detail list. Screening a real-world sanctioned address — one whose history lives on
 * Ethereum mainnet — returns a 500 from Circle's vendor, because that address has no
 * presence on Arc testnet for it to have an opinion about. So the gate is real and the
 * plumbing is proven, while the *data* behind a testnet screen is necessarily thin.
 * That is worth stating plainly rather than implying testnet screening carries the
 * same weight as mainnet.
 */

/** Categories Circle can return. The first two are gates; the rest are weighed. */
export const PROHIBITED_CATEGORIES = ["SANCTIONS", "TERRORIST_FINANCING", "CSAM"] as const;

export interface RiskSignal {
  source?: string;
  sourceValue?: string;
  riskScore?: string;
  riskCategories?: string[];
}

export interface ScreeningResult {
  /** Circle's own verdict on the address. */
  result: "APPROVED" | "DENIED" | "UNAVAILABLE";
  /** Set when the screening could not be performed, so it is never read as a pass. */
  unavailable?: string;
  /** The rule Circle matched, when it denied. */
  rule?: string;
  signals: RiskSignal[];
  /** Categories flattened out of the signals, for the decision engine to act on. */
  categories: string[];
  /** True when any prohibited category appears — a gate, not a score. */
  prohibited: boolean;
  /** One sentence for the on-chain reason, written for a business to read. */
  summary: string;
}

const ENDPOINT = "https://api.circle.com/v1/w3s/compliance/screening/addresses";

/** Cache per address for the life of the process — a sanctions list does not churn by the second. */
const cache = new Map<string, ScreeningResult>();

/**
 * Screen one address.
 *
 * Never throws. Every failure path returns `UNAVAILABLE` with a reason, because a
 * verification service being down must not be able to approve a payment by accident.
 */
export async function screenAddress(address: string): Promise<ScreeningResult> {
  const key = address.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;

  const apiKey = config.circle.apiKey;
  if (!apiKey) {
    return unavailable("Compliance screening is not configured (no CIRCLE_API_KEY).");
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        address,
        chain: config.circleBlockchain,
        idempotencyKey: randomUUID(),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      // 403 usually means Compliance Engine is not enabled on the account; an
      // unsupported chain comes back as a 400. Both are "could not check", not "clean".
      return unavailable(`Screening unavailable (${res.status}): ${body.slice(0, 140)}`);
    }

    const data = (await res.json()) as {
      data?: {
        result?: string;
        decision?: { ruleName?: string; screeningDate?: string; reasons?: RiskSignal[] };
      };
    };

    const payload = data.data ?? {};
    const signals = payload.decision?.reasons ?? [];
    const categories = [...new Set(signals.flatMap((s) => s.riskCategories ?? []))];
    const prohibited = categories.some((c) =>
      (PROHIBITED_CATEGORIES as readonly string[]).includes(c.toUpperCase()),
    );

    const out: ScreeningResult = {
      result: payload.result === "DENIED" ? "DENIED" : "APPROVED",
      rule: payload.decision?.ruleName,
      signals,
      categories,
      prohibited,
      summary: describe(payload.result === "DENIED", categories),
    };

    cache.set(key, out);
    return out;
  } catch (err) {
    return unavailable(`Screening failed: ${(err as Error).message}`);
  }
}

function unavailable(reason: string): ScreeningResult {
  // Not cached: a transient outage should not poison the address for the whole process.
  return {
    result: "UNAVAILABLE",
    unavailable: reason,
    signals: [],
    categories: [],
    prohibited: false,
    summary: "Compliance screening could not be completed for this address.",
  };
}

function describe(denied: boolean, categories: string[]): string {
  if (!denied && categories.length === 0) return "Address cleared compliance screening.";
  const list = categories.map((c) => c.toLowerCase().replace(/_/g, " ")).join(", ");
  if (!denied) return `Address flagged by screening: ${list}.`;
  return `Address denied by compliance screening: ${list || "matched a prohibited rule"}.`;
}

/** Clears the cache. Used by tests and the offline demo. */
export function resetScreeningCache() {
  cache.clear();
}
