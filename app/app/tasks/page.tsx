"use client";

import Link from "next/link";
import { useState } from "react";
import { AppBar, TabBar } from "../../components/AppChrome";
import {
  campaigns,
  moreCampaigns,
  usd,
  rate,
  rateNote,
  poolPercent,
  remaining,
  daysLeft,
  type Campaign,
} from "../../lib/data";

/**
 * Browse — the open marketplace.
 *
 * Every card answers the same three things in the same order: what it pays, how
 * much budget is still funded, and whether payment is instant. The pool bar is
 * the trust signal — the money is visibly already there.
 */

type Filter = "all" | "stream" | "once";

const ALL = [...campaigns, ...moreCampaigns];

export default function Browse() {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = ALL.filter((c) => (filter === "all" ? true : filter === "stream" ? c.streaming : !c.streaming));
  const funded = ALL.reduce((s, c) => s + remaining(c), 0);

  return (
    <main className="screen">
      <AppBar />

      <header style={{ marginBottom: 20 }}>
        <h1 className="fade-up" style={{ fontSize: 28, lineHeight: 1.1 }}>
          Campaigns paying now
        </h1>
        <p className="sub fade-up d1" style={{ fontSize: 13.5, marginTop: 6 }}>
          <b className="num" style={{ color: "var(--ink)" }}>
            {usd(funded, { cents: false })}
          </b>{" "}
          locked in escrow across {ALL.length} campaigns
        </p>
      </header>

      <div className="row fade-up d1" style={{ gap: 8, marginBottom: 18, overflowX: "auto" }}>
        {(
          [
            ["all", "All"],
            ["stream", "Keeps paying"],
            ["once", "One-time"],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            className="chip"
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            style={
              filter === key
                ? {
                    background: "linear-gradient(180deg,#f5b862,var(--amber))",
                    color: "#23160a",
                    boxShadow: "0 10px 24px -12px rgba(240,169,75,.8)",
                    whiteSpace: "nowrap",
                  }
                : { whiteSpace: "nowrap" }
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="stack grow" style={{ gap: 12 }}>
        {shown.map((c, i) => (
          <CampaignCard key={c.id} c={c} delay={i} />
        ))}
      </div>

      <TabBar />
    </main>
  );
}

function CampaignCard({ c, delay }: { c: Campaign; delay: number }) {
  return (
    <Link href="/paid" className={`card fade-up d${Math.min(delay + 1, 4)}`} style={{ display: "block" }}>
      <div className="row" style={{ gap: 11, marginBottom: 14 }}>
        <span className="avatar" style={{ background: c.colour, width: 32, height: 32, fontSize: 12.5 }} aria-hidden="true">
          {c.initial}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 14.5, letterSpacing: "-.01em" }}>{c.business}</b>
          <span className="tiny" style={{ display: "block", marginTop: -1 }}>
            {c.blurb}
          </span>
        </div>
        {c.bonded && <span className="badge badge-bonded">Bonded</span>}
      </div>

      <div className="you-earn">
        <span className="you-earn-rate num">{rate(c)}</span>
        <span className="you-earn-note">{rateNote(c)}</span>
      </div>

      <div className="poolbar" style={{ marginTop: 14 }}>
        <i style={{ width: `${poolPercent(c)}%` }} />
      </div>

      <div className="row" style={{ justifyContent: "space-between", marginTop: 10, gap: 10 }}>
        <span className="tiny num">
          <b style={{ color: "var(--ink)", fontWeight: 700 }}>{usd(remaining(c), { cents: false })}</b> still
          funded
        </span>
        <span className="tiny num">{daysLeft(c)} days left</span>
      </div>
    </Link>
  );
}
