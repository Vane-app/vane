"use client";

import { Mascot } from "./Mascot";

/**
 * Onboarding frame — one centred flow, not a split.
 *
 * A single cohesive column on one ambient background, the falcon presiding at
 * the top. No left/right panels, so it reads as one product rather than two
 * halves stitched together. The background does the work of feeling designed
 * rather than boxed.
 *
 * Two escape hatches, because the final step is a different shape from the rest:
 *  - `hero={false}` drops the presiding falcon when the step supplies its own
 *    portrait, so we never stack two large graphics and force a scroll.
 *  - `wide` lets that step use a two-column layout on a laptop instead of
 *    continuing as a 440px ribbon down a 1900px screen.
 */
export function OnboardFrame({
  children,
  hero = true,
  wide = false,
}: {
  children: React.ReactNode;
  side?: "earning" | "advertising";
  hero?: boolean;
  wide?: boolean;
}) {
  return (
    <div className="obone">
      <div className={`obone-inner${wide ? " obone-inner--wide" : ""}`}>
        {hero && (
          <div className="obone-falcon">
            <Mascot state="watching" size={132} priority />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
