"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppBar, TabBar } from "../../components/AppChrome";
import { useMe } from "../../components/Me";
import { usd } from "../../lib/data";

/**
 * Earnings.
 *
 * A working dashboard rather than a balance: what is available now, what the
 * agent is still checking, how earnings have moved over thirty days, how each
 * campaign is actually converting, and the payout ledger underneath.
 */
interface Stream {
  campaignId: number;
  business: string;
  initial: string;
  colour: string;
  clicks: number;
  results: number;
  earned: number;
  live: boolean;
}

export default function Earnings() {
  const { me: account } = useMe();

  /**
   * The balance is read from the server, never invented.
   *
   * This previously started at $2,847.50 and incremented by a random amount every few
   * seconds, which looks like live settlement and is in fact money from nowhere. A
   * product whose entire pitch is verified payment cannot have a fabricated balance on
   * its earnings screen. An honest zero is worth more than an impressive fiction.
   */
  const [available, setAvailable] = useState<number | null>(null);
  const [results, setResults] = useState(0);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/earnings")
        .then((r) => r.json())
        .then((d) => {
          if (!live) return;
          setAvailable(Number(d.available ?? 0));
          setResults(Number(d.results ?? 0));
          setStreams(Array.isArray(d.streams) ? d.streams : []);
          setLoaded(true);
        })
        .catch(() => {
          if (live) {
            setAvailable((a) => a ?? 0);
            setLoaded(true);
          }
        });

    void load();
    // Settlement is near-instant, so a slow poll is enough to show a payout landing.
    const t = setInterval(load, 10_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  const lifetime = streams.reduce((s, p) => s + p.earned, 0);
  const running = streams.filter((p) => p.live).length;

  return (
    <main className="screen">
      <AppBar />

      <header className="earn-head fade-up">
        <div>
          <span className="tiny">Earned and settled to you</span>
          <b className="money num" aria-live="polite">
            {available === null ? "—" : usd(available)}
          </b>
          {available === 0 && (
            <span className="tiny" style={{ display: "block", marginTop: 10 }}>
              Take a campaign and your first verified result lands here in about a second.
            </span>
          )}
        </div>

        {/* There is nothing to "cash out" of.
            `settle()` pays the tasker's address directly from the escrow contract, and
            that address is a wallet only the user controls. The money is already theirs
            the instant it is verified — Vane never holds it, so there is no withdrawal
            step to build and never was. The button now says what is true. */}
        {account?.walletAddress ? (
          <a
            href={`https://testnet.arcscan.app/address/${account.walletAddress}`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-amber earn-cash"
          >
            It&rsquo;s in your wallet
            <small>Paid straight to you on Arc · view it</small>
          </a>
        ) : (
          <span className="btn btn-amber earn-cash" style={{ opacity: 0.45, pointerEvents: "none" }}>
            It&rsquo;s in your wallet
            <small>Paid straight to you on Arc</small>
          </span>
        )}
      </header>

      <section className="statgrid fade-up d1" style={{ margin: "26px 0 30px" }}>
        <div>
          <b className="num">{results}</b>
          <span>verified results</span>
        </div>
        <div>
          <b className="num">{streams.reduce((s, p) => s + p.clicks, 0).toLocaleString()}</b>
          <span>clicks driven</span>
        </div>
        <div>
          <b className="num">{usd(lifetime, { cents: false })}</b>
          <span>earned all time</span>
        </div>
        <div>
          <b className="num">{running}</b>
          <span>campaigns running</span>
        </div>
      </section>

      {/* The 30-day chart is gone rather than faked. It plotted `earningsSeries`, a
          seeded curve identical for every account — a shape of success nobody had. It
          comes back when there is history to plot. */}

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

            {streams.length === 0 ? (
              <div className="perf-row" style={{ display: "block", padding: "16px 0" }}>
                <span className="tiny">
                  {loaded ? (
                    <>
                      No campaigns taken yet.{" "}
                      <Link href="/tasks" style={{ color: "var(--amber)", fontWeight: 700 }}>
                        Find one →
                      </Link>
                    </>
                  ) : (
                    "Loading…"
                  )}
                </span>
              </div>
            ) : (
              streams.map((p) => (
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
                    {p.clicks > 0 && <i className="rate">{Math.round((p.results / p.clicks) * 100)}%</i>}
                  </span>
                  <b className="num">{usd(p.earned, { cents: false })}</b>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="fade-up d4" style={{ marginBottom: 26 }}>
          <div className="sec-head">
            <span>Payout ledger</span>
            <Link href="/paid">All activity</Link>
          </div>

          {/* One row per campaign that has actually paid. A per-payout ledger needs the
              agent's decisions indexed off-chain; until then this shows what is true
              rather than a seeded list of settlements that never happened. */}
          <div className="group">
            {streams.filter((p) => p.earned > 0).length === 0 ? (
              <div className="grow-row" style={{ display: "block" }}>
                <b style={{ display: "block", marginBottom: 4 }}>Nothing settled yet</b>
                <span className="tiny">
                  Every payout the falcon approves — and every one it refuses, with its reason — appears here.
                </span>
              </div>
            ) : (
              streams
                .filter((p) => p.earned > 0)
                .map((p) => (
                  <div key={p.campaignId} className="grow-row">
                    <span className="dot dot-ok" aria-hidden="true">
                      ✓
                    </span>
                    <div className="body">
                      <b>{p.business}</b>
                      <span>
                        {p.results} verified result{p.results === 1 ? "" : "s"}
                      </span>
                    </div>
                    <b className="amt num" style={{ color: "var(--verified)" }}>
                      +{usd(p.earned)}
                    </b>
                  </div>
                ))
            )}
          </div>
        </section>
      </div>

      <TabBar />
    </main>
  );
}
