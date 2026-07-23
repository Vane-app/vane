"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppBar, TabBar } from "../../components/AppChrome";
import { performance, earningsSeries, payouts, usd } from "../../lib/data";

/**
 * Earnings.
 *
 * A working dashboard rather than a balance: what is available now, what the
 * agent is still checking, how earnings have moved over thirty days, how each
 * campaign is actually converting, and the payout ledger underneath.
 */
export default function Earnings() {
  const lifetime = performance.reduce((s, p) => s + p.earned, 0);
  const pending = performance.reduce((s, p) => s + p.held, 0);

  const [available, setAvailable] = useState(2_847_500_00 / 100);
  const [drip, setDrip] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      const d = 20_000 + Math.floor(Math.random() * 55_000);
      setAvailable((b) => b + d);
      setDrip(d);
    }, 4200);
    return () => clearInterval(t);
  }, []);

  const today = earningsSeries[earningsSeries.length - 1];

  return (
    <main className="screen">
      <AppBar />

      <header className="earn-head fade-up">
        <div>
          <span className="tiny">Available to cash out</span>
          <b className="money num" aria-live="polite">
            {usd(available)}
          </b>
          {drip > 0 && (
            <span key={available} className="pill-up num" style={{ marginTop: 11, animation: "rise .5s var(--ease) both" }}>
              ↑ {usd(drip)} just now
            </span>
          )}
        </div>

        <Link href="/paid" className="btn btn-amber earn-cash">
          Cash out
          <small>Instant · no minimum · no fee</small>
        </Link>
      </header>

      <section className="statgrid fade-up d1" style={{ margin: "26px 0 30px" }}>
        <div>
          <b className="num">{usd(today)}</b>
          <span>earned today</span>
        </div>
        <div>
          <b className="num">{usd(pending)}</b>
          <span>being verified</span>
        </div>
        <div>
          <b className="num">{usd(lifetime, { cents: false })}</b>
          <span>earned all time</span>
        </div>
        <div>
          <b className="num">{performance.filter((p) => p.live).length}</b>
          <span>campaigns running</span>
        </div>
      </section>

      <section className="fade-up d2" style={{ marginBottom: 32 }}>
        <div className="sec-head">
          <span>Last 30 days</span>
          <span className="num" style={{ color: "var(--amber)", fontWeight: 700 }}>
            {usd(today)} today
          </span>
        </div>
        <EarningsChart data={earningsSeries} />
      </section>

      <div className="two-up">
        <section className="fade-up d3" style={{ marginBottom: 26 }}>
          <div className="sec-head">
            <span>Campaign performance</span>
            <Link href="/tasks">Find more</Link>
          </div>

          <div className="perf">
            <div className="perf-head">
              <span>Campaign</span>
              <span>Clicks</span>
              <span>Results</span>
              <span>Earned</span>
            </div>

            {performance.map((p) => (
              <Link key={p.campaignId} href={`/campaign/${p.campaignId}`} className="perf-row">
                <span className="perf-name">
                  <span className="avatar" style={{ background: p.colour, width: 26, height: 26, fontSize: 11 }} aria-hidden="true">
                    {p.initial}
                  </span>
                  <b>
                    {p.business}
                    {p.live && <i className="livedot" />}
                  </b>
                </span>
                <span className="num">{p.clicks.toLocaleString()}</span>
                <span className="num">
                  {p.results}
                  <i className="rate">{Math.round((p.results / p.clicks) * 100)}%</i>
                </span>
                <b className="num">{usd(p.earned, { cents: false })}</b>
              </Link>
            ))}
          </div>
        </section>

        <section className="fade-up d4" style={{ marginBottom: 26 }}>
          <div className="sec-head">
            <span>Payout ledger</span>
            <Link href="/paid">All activity</Link>
          </div>

          <div className="group">
            {payouts.map((p) => (
              <div key={p.id} className="grow-row">
                <span className={`dot ${p.state === "held" ? "dot-no" : "dot-ok"}`} aria-hidden="true">
                  {p.state === "held" ? "✕" : p.state === "checking" ? "•" : "✓"}
                </span>
                <div className="body">
                  <b>{p.label}</b>
                  <span>
                    {p.when}
                    {p.state === "checking" && " · agent checking"}
                    {p.state === "held" && " · held, not paid"}
                  </span>
                </div>
                <b
                  className="amt num"
                  style={{
                    color:
                      p.state === "paid" ? "var(--verified)" : p.state === "held" ? "var(--faint)" : "var(--muted)",
                  }}
                >
                  {p.state === "paid" ? "+" : ""}
                  {usd(p.amount)}
                </b>
              </div>
            ))}
          </div>
        </section>
      </div>

      <TabBar />
    </main>
  );
}

/** Thin amber line, recessive grid, one emphasised endpoint. */
function EarningsChart({ data }: { data: number[] }) {
  const w = 640;
  const h = 170;
  const max = Math.max(...data);
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 22 - (v / max) * (h - 46)] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} ${w},${h - 22} 0,${h - 22}`;
  const [lx, ly] = pts[pts.length - 1];

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Daily earnings over the last 30 days, rising steadily">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={w} y1={24 + f * (h - 46)} y2={24 + f * (h - 46)} stroke="rgba(255,255,255,.06)" />
        ))}
        <polygon points={area} fill="url(#earnfill)" />
        <polyline points={line} fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={lx} cy={ly} r="4.5" fill="var(--amber)" stroke="#0a1218" strokeWidth="2.5" />
        <defs>
          <linearGradient id="earnfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(240,169,75,.28)" />
            <stop offset="100%" stopColor="rgba(240,169,75,0)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="chart-axis">
        <span>30 days ago</span>
        <span>Today</span>
      </div>
    </div>
  );
}
