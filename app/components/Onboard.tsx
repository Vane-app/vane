"use client";

import { Mark } from "./Falcon";
import { Mascot } from "./Mascot";

/**
 * Onboarding frame.
 *
 * Mobile: a single focused column, full-bleed — feels native.
 * Desktop: a two-panel split — a branded panel on the left that uses the width,
 * the form column on the right. This is why the flow no longer looks like a
 * phone stranded in the middle of a laptop screen.
 */
export function OnboardFrame({
  children,
  side,
}: {
  children: React.ReactNode;
  side: "earning" | "advertising";
}) {
  const earning = side === "earning";
  return (
    <div className="obwrap">
      <aside className="ob-brand" aria-hidden="true">
        <div className="ob-brand-top">
          <Mark size={22} color="var(--amber)" />
          <b>vane</b>
        </div>

        <div className="ob-brand-mid">
          <Mascot state="watching" size={170} className="ob-brand-falcon" priority />
          <h2 className="ob-brand-h">
            {earning ? "Get paid the second the work is proven." : "Pay only for results the agent verifies."}
          </h2>
          <ul className="ob-brand-points">
            {(earning
              ? ["No card, no wallet, no jargon", "Paid in seconds, no minimum", "The falcon verifies every result"]
              : ["Budget locked in escrow, never lost", "Fraud refused before your money moves", "Unspent budget returns automatically"]
            ).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>

        <p className="ob-brand-foot">Running on Arc · settled in USDC</p>
      </aside>

      <div className="ob-form">{children}</div>
    </div>
  );
}
