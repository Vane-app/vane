"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TabBar, AppBar } from "../../components/AppChrome";
import { Mascot, type FalconState } from "../../components/Mascot";
import { campaigns, decisions, promoters, usd, remaining, poolPercent, daysLeft } from "../../lib/data";

/** The agent, working in real time — cycles so the falcon is felt in charge. */
const AGENT_BEATS: { state: FalconState; title: string; sub: string; tone: "check" | "ok" | "no" }[] = [
  { state: "thinking", title: "Checking a signup from Amara", sub: "Reading onchain evidence and wallet history…", tone: "check" },
  { state: "approving", title: "Verified — $2.00 → Amara", sub: "Referral traced, account active. Paid in 1.2s.", tone: "ok" },
  { state: "thinking", title: "Checking 3 signups", sub: "Three wallets, created within the same hour…", tone: "check" },
  { state: "refusing", title: "Held 3 claims — not paid", sub: "Wallets created together, silent since. Budget protected.", tone: "no" },
];

function LiveAgent() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % AGENT_BEATS.length), 2800);
    return () => clearInterval(t);
  }, []);
  const b = AGENT_BEATS[i];
  return (
    <div className={`liveagent tone-${b.tone}`}>
      <div className="liveagent-falcon">
        <Mascot state={b.state} size={92} />
      </div>
      <div className="liveagent-body" key={i}>
        <span className="liveagent-tag">
          <span className="livedot" aria-hidden="true" /> The agent, live
        </span>
        <b>{b.title}</b>
        <span>{b.sub}</span>
      </div>
    </div>
  );
}

/**
 * Business — live campaign.
 *
 * The human element here is true rather than decorative: a business sees the
 * actual people promoting them, with faces and what each has earned. Held
 * payouts sit beside paid ones as a headline figure, because seeing fraud
 * refused is the strongest trust signal an advertiser can get.
 */
export default function BusinessDashboard() {
  const c = campaigns[0];
  const spentPct = 100 - poolPercent(c);

  return (
    <main className="screen">
      <AppBar />

      <header style={{ marginBottom: 22 }}>
        <h1 className="fade-up" style={{ fontSize: 29, lineHeight: 1.1, maxWidth: "13ch" }}>
          Your campaign is working
        </h1>
        <p className="sub fade-up d1" style={{ fontSize: 13.5, marginTop: 6 }}>
          Lumen · paying {usd(c.rewardPerAction)} per verified signup
        </p>
      </header>

      <section className="fade-up d1" style={{ marginBottom: 22 }}>
        <p className="eyebrow" style={{ marginBottom: 12 }}>
          Promoting you now
        </p>
        <div className="people">
          <div className="person">
            <span className="person-add" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path d="M12 6v12M6 12h12" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            <b>Invite</b>
            <span>Promoter</span>
          </div>

          {promoters.map((p) => (
            <div key={p.name} className="person">
              <span className="face-ring">
                <img className="face" src={p.face} alt="" width={44} height={44} />
              </span>
              <b>{p.name}</b>
              <span>{usd(p.earned, { cents: false })}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card fade-up d2" style={{ marginBottom: 12 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <span className="eyebrow">Escrow balance</span>
          <span className="tiny num">{daysLeft(c)} days left</span>
        </div>

        <div className="row" style={{ alignItems: "baseline", gap: 8, marginBottom: 14 }}>
          <b className="num" style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.035em" }}>
            {usd(c.spent, { cents: false })}
          </b>
          <span className="tiny num">paid of {usd(c.budget, { cents: false })} locked</span>
        </div>

        <div className="poolbar">
          <i style={{ width: `${spentPct}%` }} />
        </div>
        <p className="tiny num" style={{ marginTop: 9 }}>
          {Math.round(spentPct)}% spent · the rest returns to you automatically
        </p>
      </section>

      <section className="tiles fade-up d3" style={{ marginBottom: 22 }}>
        <div className="tile">
          <span className="tile-ic" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path
                d="M5 12.5 L10 17.5 L19 7"
                fill="none"
                stroke="var(--verified)"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <b className="num">79</b>
          <span>verified results</span>
        </div>

        <div className="tile">
          <span className="tile-ic" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path
                d="M12 3 L20 6.5 V12 C20 16.5 16.6 19.8 12 21 C7.4 19.8 4 16.5 4 12 V6.5 Z"
                fill="none"
                stroke="var(--held)"
                strokeWidth="1.9"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <b className="num">6</b>
          <span>refused by Vane</span>
        </div>
      </section>

      <section className="fade-up d3" style={{ marginBottom: 22 }}>
        <LiveAgent />
      </section>

      <section className="fade-up d4">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
          <p className="eyebrow" style={{ margin: 0 }}>
            Recent decisions
          </p>
          <Link href="/paid" className="tiny" style={{ color: "var(--amber)", fontWeight: 700 }}>
            See all
          </Link>
        </div>

        {decisions.map((d) => (
          <div key={d.id} className="event">
            {d.verdict === "settled" ? (
              <span className="dot dot-ok" aria-hidden="true">
                ✓
              </span>
            ) : (
              <span className="held-falcon" aria-hidden="true">
                <Mascot state="refusing" size={44} />
              </span>
            )}
            <div>
              <b className="num">
                {d.verdict === "settled" ? `${usd(d.amount)} → ${d.tasker}` : "3 claims refused"}
              </b>
              <span>
                {d.reason} · {d.ago}
              </span>
            </div>
          </div>
        ))}
      </section>

      <TabBar />
    </main>
  );
}
