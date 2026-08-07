"use client";

import Link from "next/link";
import { useState } from "react";
import { AppBar, TabBar } from "../../components/AppChrome";
import { Upload } from "../../components/Upload";
import { useWallet } from "../../components/Wallet";
import { useProfile } from "../../components/Profile";
import { Back } from "../../components/Back";
import { usd, FEE_BPS, type TaskType } from "../../lib/data";
import { pricingError } from "../../lib/pricing";

/**
 * Post a campaign — the business side of the marketplace.
 *
 * Kept to one screen: pick what kind of task, describe the result, set the rate
 * and budget, and see exactly what it buys and what it costs before the money is
 * locked. This is where a campaign is born; everything promoters browse comes
 * from here.
 */

export default function PostCampaign() {
  // Whether this business's results happen onchain was asked at signup and then
  // discarded — every campaign was tagged "Integration" regardless, so a business
  // that said "onchain" saw its own card contradict it.
  const { profile } = useProfile();
  const [type, setType] = useState<TaskType>("referral");
  const [banner, setBanner] = useState("");
  const [result, setResult] = useState("");
  const [rate, setRate] = useState(2);
  const [budget, setBudget] = useState(500);
  const [posted, setPosted] = useState(false);
  const { approve } = useWallet();
  const [locking, setLocking] = useState(false);
  const [lockStep, setLockStep] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const [funded, setFunded] = useState(false);

  /**
   * Locking the budget is the business's transaction, not Vane's.
   *
   * Two approvals in sequence: `approve` lets the vault pull the USDC, then
   * `createCampaign` locks it. They must run in order — the allowance has to exist
   * before the pull — so this deliberately awaits each one.
   */
  async function lockAndGoLive() {
    setLocking(true);
    setPostError(null);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskType: type,
          kind: profile.business?.kind ?? "web3",
          industry: profile.business?.industry,
          business: profile.business?.name,
          logoUrl: profile.business?.logo,
          rewardPerAction: Math.round(rate * 1_000_000),
          budget: Math.round(budget * 1_000_000),
          blurb: result,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create the campaign.");

      if (data.challenges?.length && data.auth) {
        for (const c of data.challenges) {
          setLockStep(
            c.step === "approve"
              ? "Approve the vault…"
              : c.step === "fund"
                ? "Lock the budget…"
                : "Authorise result reporting…",
          );
          await approve({ ...data.auth, challengeId: c.challengeId });
        }

        // Confirm against the chain rather than assuming. Until the escrow agrees the
        // budget is locked, this campaign cannot be sealed against or settled — so it
        // must not claim to be funded.
        setLockStep("Confirming on Arc…");
        const check = await fetch(`/api/campaigns/${data.campaign.id}/confirm`, { method: "POST" })
          .then((r) => r.json())
          .catch(() => ({ funded: false }));
        setFunded(Boolean(check.funded));
      }
      setPosted(true);
    } catch (err) {
      setPostError((err as Error).message);
    } finally {
      setLocking(false);
      setLockStep(null);
    }
  }

  const results = Math.floor(budget / rate);
  const fee = (budget * FEE_BPS) / 10_000;

  /**
   * Whether this is worth someone's time.
   *
   * A marketplace is only fair if both sides can judge the deal. The business's side
   * is protected by code — the budget is locked, unspent funds return, fraud is
   * refused. The promoter's side was not protected at all: nothing stopped a campaign
   * paying $0.02 a result, and nobody was told.
   *
   * A warning rather than a block. The business decides its own rate; it just should
   * not find out from silence that nobody took the work.
   */
  /**
   * The rates the server will refuse outright.
   *
   * Distinct from the advice below: this is not "few people will take this", it is
   * "this cannot work", and letting someone fill in the rest of the form and approve a
   * wallet transaction before telling them would be the wrong place to find out.
   */
  const blocker = pricingError(Math.round(rate * 1_000_000), Math.round(budget * 1_000_000));

  const rateNote =
    rate < 0.25
      ? { tone: "bad", text: "Below what most promoters will work for. Expect very few takers." }
      : rate < 1
        ? { tone: "warn", text: "Low for a referral. Fine for a quick action, thin for anything that takes effort." }
        : results < 5
          ? { tone: "warn", text: `This budget only buys ${results} result${results === 1 ? "" : "s"} — promoters look for room to earn.` }
          : null;

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
            {funded ? (
              <>
                {usd(budget * 1_000_000, { cents: false })} is locked in escrow on Arc. Promoters can take it now,
                and the falcon releases {usd(rate * 1_000_000)} for each verified result.
              </>
            ) : (
              <>
                Listed at {usd(rate * 1_000_000)} per result. The escrow funding has not confirmed on Arc yet — until
                it does, results here cannot be settled.
              </>
            )}
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

      <Back href="/business" label="Dashboard" />

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
          <Field label="Campaign image">
            <Upload shape="banner" value={banner} onChange={setBanner} label="Add a campaign image" />
            <p className="tiny" style={{ marginTop: 8 }}>
              Shown on your card in the marketplace. A clear image gets more promoters.
            </p>
          </Field>

          {/* The result comes first, because it is the thing being bought.
              This used to open with a four-way choice of task type — an internal
              detail of how the falcon verifies, put in front of a business that only
              wants to say what it will pay for. Two of the four were disabled, so the
              first screen advertised what is not built. The type is now inferred. */}
          <Field label="What result do you pay for?">
            <textarea
              value={result}
              onChange={(e) => setResult(e.target.value)}
              placeholder="e.g. Someone signs up and makes their first deposit of $10 or more"
              rows={3}
              className="post-textarea"
              autoFocus
            />
            <p className="tiny" style={{ marginTop: 8 }}>
              Be specific — this is exactly what the falcon verifies before it releases a payout, and what a
              promoter reads before deciding to work on it.
            </p>
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

            {rateNote && (
              <p className={`post-fairness ${rateNote.tone}`}>{rateNote.text}</p>
            )}

            <div className="post-terms">
              <Term k="Budget locked" v={usd(budget * 1_000_000, { cents: false })} />
              <Term k="Vane's fee (2.5%)" v={`${usd(fee * 1_000_000)} on results only`} />
              <Term k="If unused" v="Returns to you automatically" />
              <Term k="Verified by" v="Onchain evidence — nothing self-reported" last />
            </div>

            <button
              className="btn btn-amber"
              onClick={() => void lockAndGoLive()}
              disabled={locking || Boolean(blocker)}
              style={{ marginTop: 18, opacity: blocker ? 0.4 : 1 }}
            >
              {locking
                ? (lockStep ?? "Confirm in your wallet…")
                : `Lock ${usd(budget * 1_000_000, { cents: false })} & go live`}
            </button>
            {/* Said here rather than after they have approved a transaction. */}
            {blocker && <p className="wallet-error" style={{ marginTop: 10 }}>{blocker}</p>}
            {postError && <p className="wallet-error" style={{ marginTop: 10 }}>{postError}</p>}
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
