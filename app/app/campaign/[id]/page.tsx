"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AppBar, TabBar } from "../../../components/AppChrome";
import { Mark } from "../../../components/Falcon";
import {
  campaigns,
  moreCampaigns,
  detailFor,
  usd,
  rate,
  rateNote,
  poolPercent,
  remaining,
  daysLeft,
} from "../../../lib/data";

/**
 * Campaign detail and take-flow.
 *
 * The listing pattern a marketplace needs: the full case for the campaign on the
 * left, and an action panel that stays with you on the right. Taking a campaign
 * is the product's core action, so it happens here in two taps and ends with a
 * link in your hand rather than a confirmation message.
 */

const ALL = [...campaigns, ...moreCampaigns];

type Stage = "browse" | "terms" | "taken";

export default function CampaignPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const c = ALL.find((x) => x.id === id) ?? ALL[0];
  const d = detailFor(c.id);

  const [stage, setStage] = useState<Stage>("browse");
  const [copied, setCopied] = useState(false);

  const link = `vane.money/r/${c.business.toLowerCase().replace(/\s+/g, "")}-tunde`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(`https://${link}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="screen">
      <AppBar />

      <Link href="/tasks" className="backlink">
        ← All campaigns
      </Link>

      <div className="detail">
        {/* ------------------------------------------------ the case for it */}
        <div className="detail-main">
          <header className="fade-up" style={{ marginBottom: 26 }}>
            <div className="row" style={{ gap: 13, marginBottom: 16 }}>
              <span className="avatar" style={{ background: c.colour, width: 46, height: 46, fontSize: 17 }} aria-hidden="true">
                {c.initial}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 8 }}>
                  <b style={{ fontSize: 19, letterSpacing: "-.02em" }}>{c.business}</b>
                  {c.bonded && <span className="badge badge-bonded">Bonded</span>}
                </div>
                <span className="tiny">
                  {d.category} · {d.kind === "web3" ? "Onchain business" : "Web business"} · with Vane since{" "}
                  {d.businessSince}
                </span>
              </div>
            </div>

            <h1 style={{ fontSize: 27, lineHeight: 1.1, maxWidth: "20ch" }}>
              Earn {rate(c)} {rateNote(c)}
            </h1>
          </header>

          <Block title="What counts as a result">
            <p className="body">{d.counts}</p>
            <p className="tiny" style={{ marginTop: 10 }}>
              Your referral stays credited to you for {d.attributionDays} days after someone clicks your link.
            </p>
          </Block>

          <section className="falconblock fade-up">
            <div className="row" style={{ gap: 12, marginBottom: 14 }}>
              <span className="falcon-badge" aria-hidden="true">
                <Mark size={19} color="var(--amber)" />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 15, letterSpacing: "-.015em", display: "block" }}>
                  How Vane verifies this
                </b>
                <span className={`badge ${d.kind === "web3" ? "badge-instant" : "badge-stream"}`} style={{ marginTop: 6 }}>
                  {d.kind === "web3" ? "Verified onchain" : "Verified by integration"}
                </span>
              </div>
            </div>

            <p className="body">{d.verification}</p>

            <p className="eyebrow" style={{ margin: "18px 0 10px" }}>
              What the agent checks before paying you
            </p>
            <ul className="rules">
              {d.agentChecks.map((a) => (
                <li key={a} className="rule-ok">
                  {a}
                </li>
              ))}
            </ul>
          </section>

          <Block title="How this campaign is performing">
            <div className="statgrid">
              <Stat v={String(d.promoters)} l="promoters active" />
              <Stat v={usd(d.totalPaid, { cents: false })} l="paid out so far" />
              <Stat v={`${Math.round(d.approvalRate * 100)}%`} l="of results approved" />
              <Stat v={`${d.medianPayoutSeconds}s`} l="median time to payout" />
            </div>
          </Block>

          <Block title="What you need to do">
            <ul className="rules">
              {d.rules.map((r) => (
                <li key={r} className="rule-ok">
                  {r}
                </li>
              ))}
              {d.notAllowed.map((r) => (
                <li key={r} className="rule-no">
                  {r}
                </li>
              ))}
            </ul>
          </Block>

          <Block title="About the business">
            <div className="statgrid">
              <Stat v={String(d.businessCampaigns)} l="campaigns run" />
              <Stat v={String(d.businessDisputes)} l="disputes raised" />
              <Stat v={usd(c.budget, { cents: false })} l="funded on this one" />
            </div>
            <p className="tiny" style={{ marginTop: 14 }}>
              Budget is held in escrow by contract. If the campaign ends unspent, the remainder returns to{" "}
              {c.business} automatically — it is never held by Vane.
            </p>
          </Block>
        </div>

        {/* -------------------------------------------------- action panel */}
        <aside className="detail-side">
          <div className="panel">
            {stage !== "taken" ? (
              <>
                <div className="you-earn" style={{ marginBottom: 16 }}>
                  <span className="you-earn-rate num">{rate(c)}</span>
                  <span className="you-earn-note">{rateNote(c)}</span>
                </div>

                <div className="poolbar">
                  <i style={{ width: `${poolPercent(c)}%` }} />
                </div>
                <div className="row" style={{ justifyContent: "space-between", marginTop: 9, marginBottom: 18 }}>
                  <span className="tiny num">
                    <b style={{ color: "var(--ink)", fontWeight: 700 }}>{usd(remaining(c), { cents: false })}</b>{" "}
                    still funded
                  </span>
                  <span className="tiny num">{daysLeft(c)} days left</span>
                </div>

                {stage === "browse" ? (
                  <>
                    <button className="btn btn-amber" onClick={() => setStage("terms")}>
                      Take this campaign
                    </button>
                    <p className="tiny" style={{ textAlign: "center", marginTop: 12 }}>
                      Free to take. No approval queue.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="eyebrow" style={{ marginBottom: 10 }}>
                      Before you start
                    </p>
                    <ul className="agree">
                      <li>You earn {rate(c)} {rateNote(c)}</li>
                      <li>Paid within seconds of each verified result</li>
                      <li>Results are checked against onchain evidence</li>
                      <li>Breaking the rules above voids that payout</li>
                    </ul>
                    <button className="btn btn-amber" onClick={() => setStage("taken")}>
                      Agree &amp; get my link
                    </button>
                    <button
                      className="tiny"
                      onClick={() => setStage("browse")}
                      style={{ display: "block", margin: "12px auto 0" }}
                    >
                      Go back
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                <div className="row" style={{ gap: 11, marginBottom: 16 }}>
                  <span className="dot dot-ok" aria-hidden="true">
                    ✓
                  </span>
                  <div>
                    <b style={{ fontSize: 15, display: "block" }}>You&rsquo;re on this campaign</b>
                    <span className="tiny">Share your link — earnings start on the first result.</span>
                  </div>
                </div>

                <p className="eyebrow" style={{ marginBottom: 8 }}>
                  Your referral link
                </p>
                <div className="linkbox">
                  <span className="num">{link}</span>
                </div>

                <button className="btn btn-amber" onClick={copy} style={{ marginTop: 12 }}>
                  {copied ? "Copied" : "Copy link"}
                </button>

                <div className="statgrid" style={{ marginTop: 20 }}>
                  <Stat v="0" l="results so far" />
                  <Stat v={usd(0)} l="earned here" />
                </div>

                <Link href="/earnings" className="tiny" style={{ display: "block", textAlign: "center", marginTop: 16, color: "var(--amber)", fontWeight: 700 }}>
                  Track it in Earnings →
                </Link>
              </>
            )}
          </div>
        </aside>
      </div>

      <TabBar />
    </main>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="detail-block fade-up">
      <h2 className="eyebrow" style={{ marginBottom: 12 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({ v, l }: { v: string; l: string }) {
  return (
    <div>
      <b className="num">{v}</b>
      <span>{l}</span>
    </div>
  );
}
