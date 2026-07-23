"use client";

import Link from "next/link";
import { AppBar, TabBar } from "../../components/AppChrome";
import { useProfile } from "../../components/Profile";
import { me, performance, usd } from "../../lib/data";

/**
 * Tasker account.
 *
 * The numbers here are derived from the same `performance` data the earnings
 * dashboard uses, so the two never disagree. Reputation is the thing that earns
 * faster payouts, so it leads.
 */
export default function Account() {
  const { profile } = useProfile();
  const avatar = profile.avatar || me.avatar;
  const displayName = profile.name || me.name;
  const lifetime = performance.reduce((s, p) => s + p.earned, 0);
  const results = performance.reduce((s, p) => s + p.results, 0);
  const clicks = performance.reduce((s, p) => s + p.clicks, 0);
  const conversion = clicks ? Math.round((results / clicks) * 100) : 0;

  return (
    <main className="screen">
      <AppBar />

      <header className="acct-head fade-up">
        <span className="face-ring" style={{ padding: 3 }}>
          <img className="face" src={avatar} alt="" width={72} height={72} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 25, letterSpacing: "-.02em" }}>{displayName}</h1>
          <p className="tiny" style={{ marginTop: 3 }}>
            {me.handle} · earning since {me.since}
          </p>
        </div>
      </header>

      {/* reputation — the thing that earns faster payouts */}
      <section className="rep fade-up d1">
        <div className="rep-top">
          <div>
            <span className="eyebrow">Reputation</span>
            <b className="num">{me.reputation}</b>
            <span className="tiny">Top 8% of taskers · instant payouts unlocked</span>
          </div>
          <div className="rep-streak">
            <b className="num">{me.streak}</b>
            <span>approved in a row</span>
          </div>
        </div>
        <div className="rep-bar">
          <i style={{ width: `${me.reputation}%` }} />
        </div>
        <p className="tiny" style={{ marginTop: 10 }}>
          Higher reputation means the agent clears your results faster and with fewer checks. It rises with
          every approved result and falls if work is refused.
        </p>
      </section>

      <section className="statgrid fade-up d2" style={{ margin: "26px 0 30px" }}>
        <div>
          <b className="num">{usd(lifetime, { cents: false })}</b>
          <span>earned all time</span>
        </div>
        <div>
          <b className="num">{results.toLocaleString()}</b>
          <span>verified results</span>
        </div>
        <div>
          <b className="num">{conversion}%</b>
          <span>click-to-result</span>
        </div>
        <div>
          <b className="num">{performance.length}</b>
          <span>campaigns joined</span>
        </div>
      </section>

      <div className="two-up">
        <section className="fade-up d3" style={{ marginBottom: 24 }}>
          <div className="sec-head">
            <span>Payout account</span>
            <Link href="/earnings">Balance →</Link>
          </div>
          <div className="group">
            <div className="grow-row">
              <span className="tile-ic" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <rect x="3" y="6" width="18" height="12" rx="3" fill="none" stroke="var(--amber)" strokeWidth="1.9" />
                  <path d="M3 10h18" stroke="var(--amber)" strokeWidth="1.9" />
                </svg>
              </span>
              <div className="body">
                <b>USDC on Arc</b>
                <span>Created automatically · seedless</span>
              </div>
              <span className="badge badge-instant">Active</span>
            </div>
            <div className="grow-row">
              <span className="tile-ic" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path d="M12 3v18M5 8h9a3 3 0 0 1 0 6H7" fill="none" stroke="var(--verified)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div className="body">
                <b>Auto cash-out</b>
                <span>Off · payouts stay in your balance</span>
              </div>
              <span className="tiny" style={{ color: "var(--amber)", fontWeight: 700 }}>
                Set up
              </span>
            </div>
          </div>
        </section>

        <section className="fade-up d4" style={{ marginBottom: 24 }}>
          <div className="sec-head">
            <span>Your campaigns</span>
            <Link href="/tasks">Find more</Link>
          </div>
          <div className="group">
            {performance.map((p) => (
              <Link key={p.campaignId} href={`/campaign/${p.campaignId}`} className="grow-row">
                <span className="avatar" style={{ background: p.colour, width: 30, height: 30, fontSize: 12 }} aria-hidden="true">
                  {p.initial}
                </span>
                <div className="body">
                  <b>
                    {p.business}
                    {p.live && <i className="livedot" />}
                  </b>
                  <span>
                    {p.results} results · {p.clicks.toLocaleString()} clicks
                  </span>
                </div>
                <b className="amt num">{usd(p.earned, { cents: false })}</b>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <Link href="/" className="acct-signout tiny">
        Sign out
      </Link>

      <TabBar />
    </main>
  );
}
