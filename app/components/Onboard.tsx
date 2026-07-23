"use client";

import { Mascot } from "./Mascot";

/**
 * Onboarding frame — one centred flow, not a split.
 *
 * A single cohesive column on one ambient background, the falcon presiding at
 * the top. No left/right panels, so it reads as one product rather than two
 * halves stitched together. Same on laptop and phone; the background does the
 * work of feeling designed rather than boxed.
 */
export function OnboardFrame({ children }: { children: React.ReactNode; side?: "earning" | "advertising" }) {
  return (
    <div className="obone">
      <div className="obone-inner">
        <div className="obone-falcon">
          <Mascot state="watching" size={132} priority />
        </div>
        {children}
      </div>
    </div>
  );
}
