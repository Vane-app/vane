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

/**
 * The rest of what a listing has to be before it can exist.
 *
 * Pricing was checked and nothing else was, so a campaign could be posted with a name
 * containing markup, a blurb five thousand characters long, a budget of nine
 * quadrillion dollars, or a duration of zero days. The last one is the worst: a
 * campaign whose window has already closed can never be settled, so it would take a
 * promoter's work and refuse every result — a dead end that looks exactly like a live
 * listing until somebody tries.
 *
 * Limits chosen from what the cards actually render rather than from round numbers: a
 * name past ~40 characters wraps out of its row, and a blurb past ~140 stops being the
 * one-line description the layout is built around.
 */
export const MAX_NAME = 40;
export const MAX_BLURB = 140;
export const MAX_BUDGET = 1_000_000_000_000; // $1m — far past any demo, short of overflow
export const MIN_DAYS = 1;
export const MAX_DAYS = 90;

export function campaignError(input: {
  business: string;
  blurb: string;
  budget: number;
  durationDays: number;
}): string | null {
  const name = input.business.trim();
  if (!name) return "Give the campaign a business name.";
  if (name.length > MAX_NAME) return `Keep the business name under ${MAX_NAME} characters.`;
  // Not an XSS defence — React escapes on render — but a name is a name, and one
  // carrying markup is either a mistake or someone testing us. Either way it does not
  // belong on a card.
  if (/[<>]/.test(name)) return "The business name can't contain < or >.";

  if (input.blurb.length > MAX_BLURB) {
    return `Keep the result description under ${MAX_BLURB} characters — it's one line on a card.`;
  }
  if (input.budget > MAX_BUDGET) return "That budget is larger than this can handle.";

  if (!Number.isFinite(input.durationDays) || input.durationDays < MIN_DAYS) {
    return "A campaign has to run for at least a day — one ending today could never pay anyone.";
  }
  if (input.durationDays > MAX_DAYS) return `Campaigns can run for up to ${MAX_DAYS} days.`;

  return null;
}
