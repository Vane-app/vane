"use client";

import Link from "next/link";
import { useState } from "react";
import { AppBar, TabBar } from "../../components/AppChrome";
import { TASK_TYPES, usd, FEE_BPS, type TaskType } from "../../lib/data";

/**
 * Post a campaign — the business side of the marketplace.
 *
 * Kept to one screen: pick what kind of task, describe the result, set the rate
 * and budget, and see exactly what it buys and what it costs before the money is
 * locked. This is where a campaign is born; everything promoters browse comes
 * from here.
 */

const KIND_RESULT: Record<TaskType, string> = {
  referral: "a verified signup, deposit or trade from someone you referred",
  content: "an approved post, review or video that meets your brief",
  onchain: "a verified onchain action — a mint, swap, stake or bridge",
  bounty: "a delivered task you approve, backed by a staked dispute window",
};

export default function PostCampaign() {
  const [type, setType] = useState<TaskType>("referral");
  const [result, setResult] = useState("");
  const [rate, setRate] = useState(2);
  const [budget, setBudget] = useState(500);
  const [posted, setPosted] = useState(false);

  const results = Math.floor(budget / rate);
  const fee = (budget * FEE_BPS) / 10_000;

  if (posted) {
    return (
      <main className="screen" style={{ justifyContent: "center", textAlign: "center", paddingBottom: 40 }}>
        <AppBar />
        <div className="fade-up" style={{ margin: "auto 0" }}>
          <span className="dot dot-ok" style={{ width: 56, height: 56, fontSize: 24, margin: "0 auto 20px" }} aria-hidden="true">
            ✓
          </span>
          <h1 style={{ fontSize: 30, lineHeight: 1.1 }}>Your campaign is live</h1>
          <p className="sub" style={{ fontSize: 15, marginTop: 12, maxWidth: "34ch", marginInline: "auto" }}>
            {usd(budget * 1_000_000, { cents: false })} is locked in escrow. Promoters can take it now, and Vane
            releases {usd(rate * 1_000_000)} for each verified result.
          </p>
          <div className="stack" style={{ gap: 10, marginTop: 28, maxWidth: 360, marginInline: "auto" }}>
            <Link href="/business" className="btn btn-amber">
              Watch it work
            </Link>
            <Link href="/tasks" className="btn btn-quiet">
              See it in the marketplace
            </Link>
          </div>
        </div>
        <TabBar />
      </main>
    );
  }

  return (
    <main className="screen">
      <AppBar />

      <Link href="/tasks" className="backlink">
        ← Marketplace
      </Link>

      <header style={{ marginBottom: 26 }}>
        <h1 className="fade-up" style={{ fontSize: 28, lineHeight: 1.1 }}>
          Post a campaign
        </h1>
        <p className="sub fade-up d1" style={{ fontSize: 13.5, marginTop: 6 }}>
          Lock a budget, define the result, and pay only for what the agent verifies.
        </p>
      </header>

      <div className="two-up">
        <div className="fade-up d1">
          <Field label="What do you want people to do?">
            <div className="post-types">
              {TASK_TYPES.map((t) => (
                <button key={t.id} className={`post-type ${type === t.id ? "on" : ""}`} onClick={() => setType(t.id)}>
                  <b>{t.label}</b>
                  <span>{t.verb}</span>
                </button>
              ))}
            </div>
            <p className="tiny" style={{ marginTop: 10 }}>
              You&rsquo;ll pay for {KIND_RESULT[type]}.
            </p>
          </Field>

          <Field label="Describe the result that gets paid">
            <textarea
              value={result}
              onChange={(e) => setResult(e.target.value)}
              placeholder="e.g. A new user signs up and makes their first deposit of $10 or more."
              rows={3}
              className="post-textarea"
            />
          </Field>

          <div className="post-row">
            <Field label="Pay per result">
              <div className="post-input">
                <span>$</span>
                <input
                  type="number"
                  min={0.1}
                  step={0.5}
                  value={rate}
                  onChange={(e) => setRate(Math.max(0.1, Number(e.target.value)))}
                />
              </div>
            </Field>
            <Field label="Total budget">
              <div className="post-input">
                <span>$</span>
                <input
                  type="number"
                  min={rate}
                  step={50}
                  value={budget}
                  onChange={(e) => setBudget(Math.max(rate, Number(e.target.value)))}
                />
              </div>
            </Field>
          </div>
        </div>

        {/* the escrow summary — the trust moment */}
        <aside className="detail-side">
          <div className="panel">
            <p className="eyebrow" style={{ marginBottom: 14 }}>
              Before you lock it
            </p>

            <div className="statgrid" style={{ marginBottom: 18 }}>
              <div>
                <b className="num">{usd(rate * 1_000_000)}</b>
                <span>per result</span>
              </div>
              <div>
                <b className="num">{results.toLocaleString()}</b>
                <span>results it buys</span>
              </div>
            </div>

            <div className="post-terms">
              <Term k="Budget locked" v={usd(budget * 1_000_000, { cents: false })} />
              <Term k="Vane's fee (2.5%)" v={`${usd(fee * 1_000_000)} on results only`} />
              <Term k="If unused" v="Returns to you automatically" />
              <Term k="Verified by" v={type === "onchain" ? "Onchain evidence" : "Agent + your integration"} last />
            </div>

            <button className="btn btn-amber" style={{ marginTop: 18 }} onClick={() => setPosted(true)}>
              Lock {usd(budget * 1_000_000, { cents: false })} &amp; go live
            </button>
            <p className="tiny" style={{ textAlign: "center", marginTop: 12 }}>
              Held in escrow by contract. Not even Vane can move it.
            </p>
          </div>
        </aside>
      </div>

      <TabBar />
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="post-field">
      <label>{label}</label>
      {children}
    </div>
  );
}

function Term({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <div className="post-term" style={{ borderBottom: last ? "none" : undefined }}>
      <span>{k}</span>
      <b className="num">{v}</b>
    </div>
  );
}
