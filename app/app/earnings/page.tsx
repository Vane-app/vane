"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppBar, TabBar } from "../../components/AppChrome";
import { streams, decisions, usd } from "../../lib/data";

/**
 * Earnings.
 *
 * Framed as income streams rather than gigs: revenue-share keeps paying while
 * referred customers stay active, so the balance moves while you watch it.
 */
export default function Earnings() {
  const base = streams.reduce((s, x) => s + x.earned, 0);
  const [balance, setBalance] = useState(base);
  const [drip, setDrip] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      const d = 20_000 + Math.floor(Math.random() * 55_000);
      setBalance((b) => b + d);
      setDrip(d);
    }, 4200);
    return () => clearInterval(t);
  }, []);

  const paid = decisions.filter((d) => d.verdict === "settled");

  return (
    <main className="screen">
      <AppBar />

      <header style={{ marginBottom: 24 }}>
        <span className="tiny">Available to cash out</span>
        <b className="money num fade-up" aria-live="polite">
          {usd(balance)}
        </b>
        {drip > 0 && (
          <span key={balance} className="pill-up num" style={{ marginTop: 11, animation: "rise .5s var(--ease) both" }}>
            ↑ {usd(drip)} just now
          </span>
        )}
      </header>

      <section className="fade-up d1" style={{ marginBottom: 22 }}>
        <div className="sec-head">
          <span>Your streams</span>
          <Link href="/tasks">Find more</Link>
        </div>

        <div className="group">
          {streams.map((s) => (
            <div key={s.campaignId} className="grow-row">
              <span className="avatar" style={{ background: s.colour, width: 34, height: 34, fontSize: 13 }} aria-hidden="true">
                {s.initial}
              </span>
              <div className="body">
                <b>
                  {s.business}
                  {s.live && <i className="livedot" />}
                </b>
                <span>{s.note}</span>
              </div>
              <b className="amt num" style={{ color: s.earned ? "var(--ink)" : "var(--faint)" }}>
                {s.earned ? usd(s.earned) : "—"}
              </b>
            </div>
          ))}
        </div>
      </section>

      <section className="fade-up d2" style={{ marginBottom: 20 }}>
        <div className="sec-head">
          <span>Verified &amp; paid</span>
          <Link href="/paid">History</Link>
        </div>

        <div className="group">
          {paid.map((d) => (
            <div key={d.id} className="grow-row">
              <span className="dot dot-ok" aria-hidden="true">
                ✓
              </span>
              <div className="body">
                <b>Result verified · {d.tasker}</b>
                <span>{d.ago}</span>
              </div>
              <b className="amt num" style={{ color: "var(--verified)" }}>
                +{usd(d.amount)}
              </b>
            </div>
          ))}
        </div>
      </section>

      <Link href="/paid" className="btn btn-amber">
        Cash out
        <small>Instant · no minimum · no fee</small>
      </Link>

      <TabBar />
    </main>
  );
}
