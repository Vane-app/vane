"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TabBar, AppBar } from "../../components/AppChrome";
import { Mascot, type FalconState } from "../../components/Mascot";
import { usd } from "../../lib/data";

/**
 * Illustrative decisions, not live ones.
 *
 * These four beats show the shape of what the falcon does. They were previously
 * labelled "The agent, live" behind a pulsing dot, which claimed a real-time feed that
 * did not exist — the worst possible fake, given the agent genuinely does settle and
 * refuse on Arc. Labelled honestly until this reads real `Settled` and `Held` events
 * from the escrow, at which point the label can change back and be true.
 */
const AGENT_BEATS: { state: FalconState; title: string; sub: string; tone: "check" | "ok" | "no" }[] = [
  { state: "thinking", title: "Checking a signup", sub: "Reading onchain evidence and wallet history…", tone: "check" },
  { state: "approving", title: "Verified — paid in about a second", sub: "Referral traced, account active.", tone: "ok" },
  { state: "thinking", title: "Checking a burst of signups", sub: "Several wallets, created within the same hour…", tone: "check" },
  { state: "refusing", title: "Held — not paid", sub: "Wallets funded from one source, silent since.", tone: "no" },
];

function AgentExplainer() {
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
        <span className="liveagent-tag">How the falcon decides</span>
        <b>{b.title}</b>
        <span>{b.sub}</span>
      </div>
    </div>
  );
}

interface BizCampaign {
  id: number;
  business: string;
  initial: string;
  colour: string;
  status: string;
  budget: number;
  spent: number;
  rewardPerAction: number;
  endsAt: number;
  promoters: number;
  results: number;
  clicks: number;
  escrowCampaignId: number | null;
}

interface Summary {
  locked: number;
  spent: number;
  remaining: number;
  results: number;
  clicks: number;
  promoters: number;
  campaigns: BizCampaign[];
}

/**
 * Business dashboard.
 *
 * Every figure is this account's own, read from /api/business.
 *
 * It used to render a seeded campaign with invented promoters, "79 verified results"
 * and "6 refused by Vane" — a portfolio belonging to nobody, shown to anyone who
 * opened the page. A business that has posted nothing now sees that it has posted
 * nothing, which is both true and more useful.
 */
export default function BusinessDashboard() {
  const [data, setData] = useState<Summary | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/business")
      .then((r) => r.json())
      .then((d) => {
        if (live && !d.error) setData(d as Summary);
      })
      .catch(() => {})
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, []);

  const campaigns = data?.campaigns ?? [];
  const spentPct = data && data.locked > 0 ? Math.round((data.spent / data.locked) * 100) : 0;

  if (loaded && campaigns.length === 0) {
    return (
      <main className="screen">
        <AppBar />
        <header style={{ marginBottom: 22 }}>
          <h1 className="fade-up" style={{ fontSize: 29, lineHeight: 1.1, maxWidth: "15ch" }}>
            Nothing running yet
          </h1>
          <p className="sub fade-up d1" style={{ fontSize: 13.5, marginTop: 6, maxWidth: "44ch" }}>
            Post a campaign, lock a budget in escrow, and the falcon starts verifying results the moment
            they happen. You only pay for what it verifies.
          </p>
          <Link href="/post" className="btn btn-amber fade-up d2" style={{ marginTop: 20, maxWidth: 320 }}>
            Post your first campaign
          </Link>
        </header>

        <section className="fade-up d3" style={{ marginTop: 8 }}>
          <AgentExplainer />
        </section>

        <TabBar />
      </main>
    );
  }

  return (
    <main className="screen">
      <AppBar />

      <header style={{ marginBottom: 22 }}>
        <h1 className="fade-up" style={{ fontSize: 29, lineHeight: 1.1, maxWidth: "13ch" }}>
          {data && data.results > 0 ? "Your campaigns are working" : "Your campaigns are live"}
        </h1>
        <p className="sub fade-up d1" style={{ fontSize: 13.5, marginTop: 6 }}>
          {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"} ·{" "}
          {data ? usd(data.remaining, { cents: false }) : "—"} still in escrow
        </p>
      </header>

      <section className="card fade-up d2" style={{ marginBottom: 12 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <span className="eyebrow">Escrow balance</span>
          <span className="tiny num">{data ? usd(data.locked, { cents: false }) : "—"} locked</span>
        </div>

        <div className="row" style={{ alignItems: "baseline", gap: 8, marginBottom: 14 }}>
          <b className="num" style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.035em" }}>
            {data ? usd(data.spent, { cents: false }) : "—"}
          </b>
          <span className="tiny num">paid out so far</span>
        </div>

        <div className="poolbar">
          <i style={{ width: `${spentPct}%` }} />
        </div>
        <p className="tiny num" style={{ marginTop: 9 }}>
          {spentPct}% spent · the rest returns to you automatically when a campaign ends
        </p>
      </section>

      <section className="tiles fade-up d3" style={{ marginBottom: 22 }}>
        <div className="tile">
          <span className="tile-ic" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path d="M5 12.5 L10 17.5 L19 7" fill="none" stroke="var(--verified)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <b className="num">{data?.results ?? 0}</b>
          <span>verified results</span>
        </div>

        <div className="tile">
          <span className="tile-ic" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path d="M12 3 L20 6.5 V12 C20 16.5 16.6 19.8 12 21 C7.4 19.8 4 16.5 4 12 V6.5 Z" fill="none" stroke="var(--amber)" strokeWidth="1.9" strokeLinejoin="round" />
            </svg>
          </span>
          <b className="num">{data?.promoters ?? 0}</b>
          <span>promoters on it</span>
        </div>
      </section>

      <section className="fade-up d3" style={{ marginBottom: 22 }}>
        <div className="sec-head">
          <span>Your campaigns</span>
          <Link href="/post">Post another</Link>
        </div>
        <div className="group">
          {campaigns.map((c) => (
            <Link key={c.id} href={`/campaign/${c.id}`} className="grow-row">
              <span className="avatar" style={{ background: c.colour, width: 30, height: 30, fontSize: 12 }} aria-hidden="true">
                {c.initial}
              </span>
              <div className="body">
                <b>
                  {c.business}
                  {c.status === "active" && <i className="livedot" />}
                </b>
                <span>
                  {c.results} result{c.results === 1 ? "" : "s"} · {c.promoters} promoter
                  {c.promoters === 1 ? "" : "s"} · {usd(c.rewardPerAction)} each
                  {c.escrowCampaignId === null && " · not yet funded onchain"}
                </span>
              </div>
              <b className="amt num">{usd(c.budget - c.spent, { cents: false })}</b>
            </Link>
          ))}
        </div>
      </section>

      <section className="fade-up d4">
        <AgentExplainer />
      </section>

      <TabBar />
    </main>
  );
}
