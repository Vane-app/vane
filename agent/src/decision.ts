/**
 * The falcon's judgement.
 *
 * This is the part of Vane that is not a payment script. Every claimed result is
 * scored against real on-chain signals before money moves, and the agent writes
 * down why it decided what it decided — that reasoning is emitted on-chain with
 * the settlement, so a business can audit the agent rather than trust it.
 *
 * Design rules:
 *  - Deterministic checks run first and decide the overwhelming majority of cases.
 *    An LLM is only consulted for genuinely ambiguous ones (Tier 3, later), which
 *    keeps cost and latency flat as volume grows.
 *  - The agent can only ever *withhold* money. It cannot redirect it: the payee is
 *    derived on-chain from the referral seal, never passed in by this code.
 *  - Every rule returns a human sentence. If a rule cannot explain itself in one
 *    line a business would understand, it does not belong here.
 */

export type Verdict = "settle" | "hold" | "review";

export interface ConversionClaim {
  campaignId: bigint;
  /** The converting wallet. The tasker is derived on-chain, not from this object. */
  wallet: `0x${string}`;
  actionIndex: bigint;
  kind: string;
  /** Block timestamp of the conversion, seconds. */
  observedAt: number;
}

export interface WalletSignals {
  /** When this wallet was sealed to a referral code, seconds. */
  sealedAt: number;
  /** First time this address appears on chain, seconds. 0 if unknown. */
  firstSeenAt: number;
  /** Total transactions this wallet has ever sent. */
  txCount: number;
  /** Transactions sent *after* the conversion — did a real person keep using the app? */
  txCountAfterConversion: number;
  /** USDC balance, 6dp base units. */
  usdcBalance: bigint;
  /** Address that first funded this wallet, if known. */
  fundedBy?: `0x${string}`;
}

export interface TaskerSignals {
  address: `0x${string}`;
  /** Conversions this tasker has had settled, all campaigns. */
  settledCount: number;
  /** Conversions this tasker has had held, all campaigns. */
  heldCount: number;
  /** Conversions submitted by this tasker in the last hour, this campaign. */
  lastHourCount: number;
  /** Distinct funding parents across this tasker's referred wallets. */
  distinctFunders: number;
  /** Referred wallets on this campaign. */
  referredCount: number;
}

export interface Decision {
  verdict: Verdict;
  /** 0 = clean, 100 = certainly fraudulent. */
  risk: number;
  /** One-line reason, written for the business. Emitted on-chain. */
  reason: string;
  /** Every signal that fired, for the decision log UI. */
  signals: string[];
}

/** Tunables. Deliberately in one place so they can be adjusted from real data. */
export const THRESHOLDS = {
  /** A wallet sealed and converting within this window looks scripted. */
  instantConversionSeconds: 45,
  /** A wallet with no history at all is not automatically fraud, but it is thin. */
  minTxCountForTrust: 3,
  /** Real users do something after converting. Silence is the strongest sybil tell. */
  requireActivityAfterSeconds: 600,
  /** Conversions per tasker per hour before velocity looks automated. */
  velocityPerHour: 25,
  /** If nearly all of a tasker's wallets share one funder, that is a farm. */
  funderConcentration: 0.25,
  /** Tasker reputation below this gets extra scrutiny. */
  goodApprovalRate: 0.9,
  /** risk >= this is refused outright. */
  holdAt: 60,
  /** risk >= this is paid but flagged for review. */
  reviewAt: 30,
} as const;

export function evaluate(
  claim: ConversionClaim,
  wallet: WalletSignals,
  tasker: TaskerSignals,
  now: number = Math.floor(Date.now() / 1000),
): Decision {
  const signals: string[] = [];
  let risk = 0;

  // --- 1. Was the conversion humanly possible? -----------------------------
  const timeToConvert = claim.observedAt - wallet.sealedAt;
  if (wallet.sealedAt === 0) {
    return {
      verdict: "hold",
      risk: 100,
      reason: "No referral seal for this wallet — nothing to attribute.",
      signals: ["wallet was never sealed to a referral code"],
    };
  }
  if (timeToConvert < 0) {
    return {
      verdict: "hold",
      risk: 100,
      reason: "Conversion predates the referral — attribution claimed after the fact.",
      signals: ["conversion timestamp is earlier than the referral seal"],
    };
  }
  if (timeToConvert < THRESHOLDS.instantConversionSeconds) {
    risk += 30;
    signals.push(`converted ${timeToConvert}s after first touch — faster than a human flow`);
  }

  // --- 2. Is there a person behind the wallet? -----------------------------
  const walletAge = wallet.firstSeenAt > 0 ? claim.observedAt - wallet.firstSeenAt : 0;
  if (wallet.txCount <= 1) {
    risk += 25;
    signals.push("wallet has no history beyond this conversion");
  } else if (wallet.txCount < THRESHOLDS.minTxCountForTrust) {
    risk += 10;
    signals.push(`wallet has only ${wallet.txCount} lifetime transactions`);
  }
  if (walletAge > 0 && walletAge < THRESHOLDS.instantConversionSeconds * 2) {
    risk += 20;
    signals.push("wallet was created moments before converting");
  }

  const elapsedSinceConversion = now - claim.observedAt;
  if (
    elapsedSinceConversion >= THRESHOLDS.requireActivityAfterSeconds &&
    wallet.txCountAfterConversion === 0
  ) {
    risk += 25;
    signals.push("no activity at all after converting — the account went silent");
  } else if (wallet.txCountAfterConversion > 0) {
    risk -= 10;
    signals.push(`kept using the app after signing up (${wallet.txCountAfterConversion} later actions)`);
  }

  // --- 3. Does this look like a farm rather than an audience? --------------
  if (tasker.lastHourCount > THRESHOLDS.velocityPerHour) {
    risk += 20;
    signals.push(`${tasker.lastHourCount} conversions from this tasker in the last hour`);
  }
  if (tasker.referredCount >= 4 && tasker.distinctFunders > 0) {
    const concentration = tasker.distinctFunders / tasker.referredCount;
    if (concentration <= THRESHOLDS.funderConcentration) {
      risk += 30;
      signals.push(
        `${tasker.referredCount} referred wallets funded from only ${tasker.distinctFunders} source(s)`,
      );
    }
  }

  // --- 4. What has this tasker earned in trust? ---------------------------
  const attempts = tasker.settledCount + tasker.heldCount;
  if (attempts >= 10) {
    const approval = tasker.settledCount / attempts;
    if (approval >= THRESHOLDS.goodApprovalRate) {
      risk -= 15;
      signals.push(`track record: ${Math.round(approval * 100)}% approved across ${attempts} results`);
    } else {
      risk += 15;
      signals.push(`track record: only ${Math.round(approval * 100)}% of past results were approved`);
    }
  } else if (attempts === 0) {
    signals.push("new tasker — standard checks applied");
  }

  risk = Math.max(0, Math.min(100, risk));

  if (risk >= THRESHOLDS.holdAt) {
    return { verdict: "hold", risk, reason: primaryReason(signals, "hold"), signals };
  }
  if (risk >= THRESHOLDS.reviewAt) {
    return { verdict: "review", risk, reason: primaryReason(signals, "review"), signals };
  }
  return { verdict: "settle", risk, reason: primaryReason(signals, "settle"), signals };
}

/**
 * Cluster check across a batch — catches the farm that individually looks fine.
 * If many wallets were sealed inside the same narrow window for one tasker, the
 * pattern is the evidence, not any single wallet.
 */
export function detectCluster(
  seals: { wallet: `0x${string}`; sealedAt: number }[],
  windowSeconds = 300,
  minCluster = 3,
): { clustered: `0x${string}`[]; reason?: string } {
  if (seals.length < minCluster) return { clustered: [] };
  const sorted = [...seals].sort((a, b) => a.sealedAt - b.sealedAt);

  let best: typeof sorted = [];
  for (let i = 0; i < sorted.length; i++) {
    const window = sorted.filter(
      (s) => s.sealedAt >= sorted[i].sealedAt && s.sealedAt <= sorted[i].sealedAt + windowSeconds,
    );
    if (window.length > best.length) best = window;
  }

  if (best.length >= minCluster) {
    return {
      clustered: best.map((s) => s.wallet),
      reason: `${best.length} wallets sealed within ${Math.round(windowSeconds / 60)} minutes of each other`,
    };
  }
  return { clustered: [] };
}

function primaryReason(signals: string[], verdict: Verdict): string {
  if (verdict === "settle") {
    const positive = signals.find((s) => s.startsWith("kept using") || s.startsWith("track record: 9"));
    return positive
      ? `Verified — ${positive}.`
      : "Verified — referral traced on-chain and the account looks genuine.";
  }
  const worst = signals.find((s) => !s.startsWith("kept using") && !s.startsWith("track record: 9"));
  return verdict === "hold"
    ? `Held — ${worst ?? "risk signals exceeded the settlement threshold"}.`
    : `Paid, flagged for review — ${worst ?? "mild risk signals present"}.`;
}
