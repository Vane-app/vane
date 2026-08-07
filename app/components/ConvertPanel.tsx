"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useWallet } from "./Wallet";
import { usd } from "../lib/data";

/**
 * The referred visitor's side of a campaign.
 *
 * Someone arriving through a promoter's link had nowhere to go. They could read the
 * campaign, and the one thing the whole marketplace is built to record — that they did
 * the thing — was not possible from a browser. The falcon watched an event nothing in
 * the product could emit, so no tasker had ever been paid through the app.
 *
 * Shown only to someone who actually followed a referral link, because without a ref
 * there is nothing to attribute and the registry would decline to record.
 *
 * The verdict is shown in full afterwards, including when it goes against the tasker.
 * A marketplace that only displays its agent's reasoning when it pays out is asking to
 * be trusted; showing the refusals, with the signals behind them, is the part that
 * makes the agent auditable.
 */

interface Decision {
  wallet: string;
  verdict: "settle" | "hold" | "review";
  reason: string;
  signals: string[];
  risk: number;
}

type Stage = "idle" | "preparing" | "approving" | "settling" | "done";

export function ConvertPanel({
  campaignId,
  business,
  rewardPerAction,
}: {
  campaignId: number;
  business: string;
  rewardPerAction: number;
}) {
  const ref = useSearchParams().get("ref");
  const { address, approve } = useWallet();
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [unjudged, setUnjudged] = useState(false);

  if (!ref) return null;

  async function convert() {
    setError(null);
    setUnjudged(false);
    setStage("preparing");

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refCode: ref }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not prepare that.");

      setStage("approving");
      await approve(data.challenge);

      // The conversion is on Arc now. Ask the falcon to judge it rather than waiting
      // for the nightly pass — the whole claim is that this settles while you watch.
      setStage("settling");
      const settled = await fetch("/api/cron/settle", { method: "POST" });
      const out = await settled.json();

      const mine = (out.decisions ?? []).find(
        (d: Decision) => address && d.wallet.toLowerCase() === address.toLowerCase(),
      );
      // A conversion that lands a block or two late is judged by the next pass. Say that
      // rather than showing nothing, which reads as failure.
      if (mine) setDecision(mine);
      else setUnjudged(true);
      setStage("done");
    } catch (err) {
      setError((err as Error).message);
      setStage("idle");
    }
  }

  const busy = stage !== "idle" && stage !== "done";
  // Deliberately not "you get paid". The reward goes to the promoter who sent this
  // person here, and a button that reads like an offer to the reader is a lie told at
  // the exact moment they are deciding to sign something.
  const label =
    stage === "preparing"
      ? "Preparing…"
      : stage === "approving"
        ? "Approve in your wallet…"
        : stage === "settling"
          ? "The falcon is checking…"
          : `Complete this action at ${business}`;

  return (
    <section className="card fade-up" style={{ marginTop: 18 }}>
      <p className="eyebrow" style={{ marginBottom: 8 }}>You were referred here</p>

      {!decision && !unjudged && (
        <>
          <p className="sub" style={{ fontSize: 14, marginBottom: 10 }}>
            Doing this pays <b style={{ color: "var(--ink)" }}>the promoter who sent you</b>{" "}
            {usd(rewardPerAction)} from {business}&rsquo;s escrow. You pay nothing and receive
            nothing — you are the result they are buying.
          </p>
          {/* Said plainly, because a judge should not have to guess which parts are real.
              The transaction is genuine; the shop it happens in is the stand-in. */}
          <p className="tiny" style={{ marginBottom: 14 }}>
            This button stands in for {business}&rsquo;s own signup. Normally you would do
            this on their site and their system would tell Vane — here it is recorded
            straight onto Arc so the whole path is visible.
          </p>
          <button className="btn btn-amber" onClick={() => void convert()} disabled={busy}>
            {label}
          </button>
          {error && <p className="wallet-error" style={{ marginTop: 10 }}>{error}</p>}
        </>
      )}

      {unjudged && (
        <p className="sub" style={{ fontSize: 14 }}>
          Recorded on Arc. The falcon judges it on its next pass — the promoter&rsquo;s
          earnings will show it shortly.
        </p>
      )}

      {decision && (
        <div>
          <p style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>
            {decision.verdict === "hold" ? "Held for review" : "Paid"}
          </p>
          <p className="sub" style={{ fontSize: 14, marginBottom: 12 }}>{decision.reason}</p>

          {decision.signals.length > 0 && (
            <>
              <p className="eyebrow" style={{ marginBottom: 6 }}>
                What it looked at · risk {decision.risk}
              </p>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {decision.signals.map((s, i) => (
                  <li key={i} className="tiny" style={{ marginBottom: 4 }}>{s}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
