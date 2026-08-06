"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { TabBar, AppBar } from "../../components/AppChrome";
import { Mascot, type FalconState } from "../../components/Mascot";
import { AccountPanel } from "../../components/Account";
import { CampaignControls } from "../../components/CampaignControls";
import { Decisions } from "../../components/Decisions";
import { Logo } from "../../components/Logo";
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
  logoUrl: string | null;
  blurb: string;
  status: string;
  budget: number;
  spent: number;
  remaining: number;
  rewardPerAction: number;
  rateLabel: string | null;
  endsAt: number;
  taskType: string;
  escrowCampaignId: number | null;
  promoters: number;
  results: number;
  clicks: number;
  resultsLeft: number;
  daysLeft: number;
  conversion: number | null;
}

interface Promoter {
  id: string;
  name: string;
  avatar: string;
  reputation: number;
  clicks: number;
  results: number;
  earned: number;
  campaigns: number;
  conversion: number | null;
}

interface Summary {
  locked: number;
  spent: number;
  remaining: number;
  results: number;
  clicks: number;
  promoters: number;
  costPerResult: number | null;
  campaigns: BizCampaign[];
}

/**
 * Business dashboard — an operating console, not a report.
 *
 * Every figure is this account's own, read from /api/business. It previously rendered
 * a seeded campaign with invented promoters and "79 verified results" — a portfolio
 * belonging to nobody, shown to anyone who opened the page.
 *
 * Four things a business needs and had none of: what each campaign is costing and how
 * much longer it can run, who is promoting them, the falcon's real decisions, and the
 * ability to actually stop something.
 */
export default function BusinessDashboard() {
  const [data, setData] = useState<Summary | null>(null);
  const [promoters, setPromoters] = useState<Promoter[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    void fetch("/api/business")
      .then((r) => r.json())
      .then((d) => !d.error && setData(d as Summary))
      .catch(() => {})
      .finally(() => setLoaded(true));
    void fetch("/api/business/promoters")
      .then((r) => r.json())
      .then((d) => Array.isArray(d.promoters) && setPromoters(d.promoters))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

        <AccountPanel />
        <TabBar />
      </main>
    );
  }

  return (
    <main className="screen">
      <AppBar />

      <header className="biz-head">
        <div>
          <h1 className="fade-up" style={{ fontSize: 29, lineHeight: 1.1 }}>
            {data && data.results > 0 ? "Your campaigns are working" : "Your campaigns are live"}
          </h1>
          <p className="sub fade-up d1" style={{ fontSize: 13.5, marginTop: 6 }}>
            {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"} ·{" "}
            {data ? usd(data.remaining, { cents: false }) : "—"} still in escrow
          </p>
        </div>
        <Link href="/post" className="btn btn-amber biz-post">
          Post a campaign
        </Link>
      </header>

      {/* The four numbers a business runs on. Cost per result is the one that says
          whether any of this is worth doing. */}
      <section className="biz-kpis fade-up d1">
        <div className="biz-kpi">
          <b className="num">{data ? usd(data.spent, { cents: false }) : "—"}</b>
          <span>paid out</span>
          <i>
            {spentPct}% of {data ? usd(data.locked, { cents: false }) : "—"} locked
          </i>
        </div>
        <div className="biz-kpi">
          <b className="num">{data?.results ?? 0}</b>
          <span>verified results</span>
          <i>{data?.clicks ?? 0} clicks driven</i>
        </div>
        <div className="biz-kpi">
          <b className="num">{data?.costPerResult ? usd(data.costPerResult) : "—"}</b>
          <span>cost per result</span>
          <i>{data?.results ? "across every campaign" : "no results yet"}</i>
        </div>
        <div className="biz-kpi">
          <b className="num">{data?.promoters ?? 0}</b>
          <span>promoters</span>
          <i>{promoters.length ? `top earner ${usd(promoters[0].earned)}` : "none yet"}</i>
        </div>
      </section>

      <div className="biz-grid">
        <section className="fade-up d2">
          <div className="sec-head">
            <span>Campaigns</span>
          </div>
          <div className="biz-camps">
            {campaigns.map((c) => (
              <article key={c.id} className={`biz-camp ${c.status !== "active" ? "is-off" : ""}`}>
                <div className="biz-camp-head">
                  <Logo src={c.logoUrl} initial={c.initial} colour={c.colour} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ display: "block", fontSize: 15 }}>
                      {c.business}
                      {c.status === "active" && <i className="livedot" />}
                    </b>
                    <span className="tiny">
                      {c.rateLabel || usd(c.rewardPerAction)} per result
                      {c.escrowCampaignId === null && " · not funded onchain"}
                    </span>
                  </div>
                  {c.status !== "active" && <span className="biz-status">{c.status}</span>}
                </div>

                <div className="poolbar">
                  <i style={{ width: `${c.budget > 0 ? Math.round((c.spent / c.budget) * 100) : 0}%` }} />
                </div>
                <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
                  <span className="tiny num">
                    {usd(c.remaining, { cents: false })} left · {c.resultsLeft} more results
                  </span>
                  <span className="tiny num">{c.daysLeft}d left</span>
                </div>

                <div className="biz-camp-stats">
                  <div>
                    <b className="num">{c.results}</b>
                    <span>results</span>
                  </div>
                  <div>
                    <b className="num">{c.promoters}</b>
                    <span>promoters</span>
                  </div>
                  <div>
                    <b className="num">{c.conversion === null ? "—" : `${c.conversion}%`}</b>
                    <span>convert</span>
                  </div>
                </div>

                <CampaignControls campaignId={c.id} status={c.status} onChanged={load} />
              </article>
            ))}
          </div>
        </section>

        <div className="biz-side">
          {/* Who is actually doing the work. A promoter count alone is the least
              useful form of that number. */}
          <section className="fade-up d3">
            <div className="sec-head">
              <span>Who&rsquo;s promoting you</span>
            </div>
            <div className="group">
              {promoters.length === 0 ? (
                <div className="grow-row" style={{ display: "block" }}>
                  <b style={{ display: "block", marginBottom: 4 }}>Nobody yet</b>
                  <span className="tiny">
                    Your campaign is in the marketplace. Promoters who take it appear here.
                  </span>
                </div>
              ) : (
                promoters.map((p) => (
                  <div key={p.id} className="grow-row">
                    {p.avatar ? (
                      <span className="face-ring" style={{ padding: 2 }}>
                        <img className="face" src={p.avatar} alt="" width={30} height={30} />
                      </span>
                    ) : (
                      <span className="avatar" style={{ width: 30, height: 30, fontSize: 12 }} aria-hidden="true">
                        {p.name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div className="body">
                      <b>{p.name}</b>
                      <span>
                        {p.results} result{p.results === 1 ? "" : "s"} {"·"}{" "}
                        {p.conversion === null ? "no clicks yet" : `${p.conversion}% convert`}
                      </span>
                    </div>
                    <b className="amt num">{usd(p.earned)}</b>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* The refusals are the product. A business's deepest fear is paying for
              fraud, and the answer is a list it can verify on the explorer itself. */}
          <section className="fade-up d4">
            <div className="sec-head">
              <span>What the falcon decided</span>
            </div>
            <Decisions />
          </section>
        </div>
      </div>

      <AccountPanel />
      <TabBar />
    </main>
  );
}
