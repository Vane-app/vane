/**
 * What a campaign has to be worth to exist.
 *
 * A business could post a campaign paying a fiftieth of a cent per result. Nothing
 * stopped it, and nothing warned them: the listing appeared in the marketplace, no
 * promoter ever took it, and it sat there looking like a product that does not work.
 * The business learns nothing, the marketplace looks dead, and the next person
 * browsing sees work nobody wants.
 *
 * A rate is a promise that somebody's time is worth spending. These are the floors
 * below which that promise is not credible — checked on the server, and shown in the
 * form before anyone reaches them, because a rule you only meet as an error is a rule
 * that wasted your time.
 *
 * Deliberately not a price control. A business sets its own rate and its own budget;
 * this only refuses the rates that cannot work for anyone, and tells them what the
 * numbers mean before they lock money up.
 */

// Re-exported rather than redeclared: two copies of the fee would eventually disagree,
// and the one the business is shown would not be the one they are charged.
export { FEE_BPS } from "./data";
import { FEE_BPS } from "./data";

/**
 * The least a result can pay: ten cents.
 *
 * Below this the fee and the gas stop being rounding errors against the reward, and
 * more importantly nobody promotes anything for a nickel. It is a floor on whether the
 * offer is real, not on what Vane will process.
 */
export const MIN_REWARD = 100_000; // $0.10 in USDC's 6 decimals

/**
 * A budget has to buy a few results.
 *
 * One that covers a single result is not a campaign — it is a listing that leaves the
 * marketplace the moment the first person delivers, having wasted everyone who was
 * looking at it.
 */
export const MIN_RESULTS = 5;

export interface Economics {
  /** How many results the budget covers. */
  results: number;
  /** Vane's fee on each result. */
  feePerResult: number;
  /** What the promoter actually receives per result. */
  promoterReceives: number;
  /** Total fee if the budget is spent in full. */
  totalFee: number;
}

export function economics(rewardPerAction: number, budget: number): Economics {
  const feePerResult = Math.floor((rewardPerAction * FEE_BPS) / 10_000);
  const results = rewardPerAction > 0 ? Math.floor(budget / rewardPerAction) : 0;
  return {
    results,
    feePerResult,
    promoterReceives: rewardPerAction - feePerResult,
    totalFee: feePerResult * results,
  };
}

/**
 * Why this campaign cannot be posted, or null if it can.
 *
 * Returns the reason in the words the business needs to act on — the number they typed
 * and the number it has to clear — rather than "invalid input".
 */
export function pricingError(rewardPerAction: number, budget: number): string | null {
  if (!Number.isFinite(rewardPerAction) || rewardPerAction <= 0) {
    return "Set what you'll pay for each result.";
  }
  if (!Number.isFinite(budget) || budget <= 0) {
    return "Set a total budget.";
  }
  if (rewardPerAction > budget) {
    return "Your budget has to cover at least one result.";
  }
  if (rewardPerAction < MIN_REWARD) {
    return `Pay at least $${(MIN_REWARD / 1e6).toFixed(2)} per result — below that nobody will take it, and the campaign will sit unclaimed.`;
  }
  const { results } = economics(rewardPerAction, budget);
  if (results < MIN_RESULTS) {
    return `That budget only covers ${results} result${results === 1 ? "" : "s"}. Fund at least ${MIN_RESULTS} so the campaign is worth someone's time.`;
  }
  return null;
}
