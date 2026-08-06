"use client";

import { useEffect, useState } from "react";
import { usd } from "../lib/data";

/**
 * The falcon's decisions, read off Arc.
 *
 * One component for both sides, because both are entitled to the same record: the
 * business is protecting a budget, the tasker lost a payout. A refusal reads the same
 * either way — the agent's own sentence, and the transaction that recorded it.
 *
 * `mine` switches to this account's own work; without it, everything the agent decided.
 */

export interface OnChainDecision {
  verdict: "settled" | "held";
  campaignId: number;
  wallet: string;
  actionIndex: number;
  amount?: string;
  reason: string;
  txHash: string;
}

export function Decisions({ mine = false, emptyNote }: { mine?: boolean; emptyNote?: string }) {
  const [rows, setRows] = useState<OnChainDecision[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [explorer, setExplorer] = useState("https://testnet.arcscan.app");

  useEffect(() => {
    let live = true;
    const url = mine ? "/api/me/decisions" : "/api/decisions";
    const load = () =>
      fetch(url)
        .then((r) => r.json())
        .then((d) => {
          if (!live) return;
          setRows(Array.isArray(d.decisions) ? d.decisions : []);
          setScanning(Boolean(d.scanning));
          if (d.explorer) setExplorer(d.explorer);
        })
        .catch(() => live && setRows([]));

    void load();
    // Settlement is near-instant, so a slow poll is enough to catch one landing.
    const t = setInterval(load, 15_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [mine]);

  if (rows === null || (rows.length === 0 && scanning)) {
    return (
      <div className="group">
        <div className="grow-row" style={{ display: "block" }}>
          <b style={{ display: "block", marginBottom: 4 }}>Reading the chain…</b>
          <span className="tiny">Every decision the falcon has made is public. Fetching them from Arc.</span>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="group">
        <div className="grow-row" style={{ display: "block" }}>
          <b style={{ display: "block", marginBottom: 4 }}>Nothing decided yet</b>
          <span className="tiny">
            {emptyNote ??
              "Every payout the falcon approves — and every one it refuses, with its reason — appears here."}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="group">
      {rows.map((d) => (
        <a
          key={`${d.txHash}-${d.wallet}-${d.actionIndex}`}
          href={`${explorer}/tx/${d.txHash}`}
          target="_blank"
          rel="noreferrer"
          className="grow-row"
        >
          <span className={`dot ${d.verdict === "held" ? "dot-no" : "dot-ok"}`} aria-hidden="true">
            {d.verdict === "held" ? "✕" : "✓"}
          </span>
          <div className="body">
            <b>
              {d.verdict === "settled"
                ? `${usd(Number(d.amount ?? 0))} ${mine ? "paid to you" : "paid"}`
                : mine
                  ? "Not paid — held"
                  : "Refused — not paid"}
            </b>
            <span>{d.reason}</span>
          </div>
          <span className="tiny num" style={{ color: "var(--faint)" }}>
            {d.wallet.slice(0, 6)}…
          </span>
        </a>
      ))}
    </div>
  );
}
