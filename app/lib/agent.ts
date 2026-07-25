/**
 * The falcon's judgement, app-side.
 *
 * A compact version of the decision engine (the full one lives in the agent
 * service, agent/src/decision.ts) so the conversion endpoint can decide inline
 * for the demo: score a claimed result against the signals we have, and return a
 * verdict with a written reason — the same shape the agent settles on.
 */

export interface ConversionSignals {
  /** Seconds between the referral being recorded and the conversion. */
  timeToConvert: number;
  /** Lifetime transactions of the converting wallet. */
  walletTxCount: number;
  /** Activity after converting — real users keep using the product. */
  activityAfter: number;
  /** Conversions from this promoter in the last hour. */
  velocity: number;
  /** The promoter's approval rate so far, 0–1. */
  approvalRate: number;
  /** Distinct funders across the promoter's referred wallets vs the count. */
  funderConcentration: number; // 0–1, low = suspicious
}

export interface Verdict {
  verdict: "settled" | "held";
  risk: number;
  reason: string;
}

export function decide(s: ConversionSignals): Verdict {
  let risk = 0;
  const flags: string[] = [];

  if (s.timeToConvert >= 0 && s.timeToConvert < 45) {
    risk += 30;
    flags.push(`converted ${Math.max(0, Math.round(s.timeToConvert))}s after first touch — faster than a human flow`);
  }
  if (s.walletTxCount <= 1) {
    risk += 25;
    flags.push("wallet has no history beyond this conversion");
  }
  if (s.activityAfter === 0) {
    risk += 25;
    flags.push("no activity after converting — the account went silent");
  } else {
    risk -= 10;
  }
  if (s.velocity > 25) {
    risk += 20;
    flags.push(`${s.velocity} conversions from this promoter in the last hour`);
  }
  if (s.funderConcentration <= 0.25) {
    risk += 30;
    flags.push("referred wallets funded from only one source");
  }
  if (s.approvalRate >= 0.9) {
    risk -= 15;
  } else if (s.approvalRate < 0.5) {
    risk += 15;
    flags.push(`the promoter's track record is only ${Math.round(s.approvalRate * 100)}% approved`);
  }

  risk = Math.max(0, Math.min(100, risk));

  if (risk >= 60) {
    return { verdict: "held", risk, reason: `Held — ${flags[0] ?? "risk signals exceeded the threshold"}.` };
  }
  return {
    verdict: "settled",
    risk,
    reason:
      s.activityAfter > 0
        ? "Verified — referral traced and the account stayed active."
        : "Verified — referral traced on-chain, checks passed.",
  };
}
