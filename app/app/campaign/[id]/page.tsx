"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppBar, TabBar } from "../../../components/AppChrome";
import { Mark } from "../../../components/Falcon";
import { useWallet } from "../../../components/Wallet";
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
  slugFor,
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

  /**
   * The campaign comes from the server.
   *
   * The bundled array is only the first paint, so the page is never blank; the live
   * record replaces it. Crucially there is no `?? ALL[0]` fallback any more — an id we
   * do not have used to render a different business's campaign, complete with their
   * rate and budget, which is about the worst thing a marketplace listing can do.
   */
  const seed = ALL.find((x) => x.id === id) ?? null;
  const [c, setC] = useState(seed);
  const [perf, setPerf] = useState<{ promoters: number; results: number; totalPaid: number } | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    let live = true;
    fetch(`/api/campaigns/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("not found"))))
      .then((data) => {
        if (!live) return;
        setC(data.campaign);
        setPerf(data.performance);
      })
      .catch(() => live && !seed && setMissing(true));
    return () => {
      live = false;
    };
  }, [id, seed]);

  const d = detailFor(id);

  const [stage, setStage] = useState<Stage>("browse");
  const [copied, setCopied] = useState(false);
  const { approve } = useWallet();
  const [taking, setTaking] = useState(false);
  const [takeLink, setTakeLink] = useState<string | null>(null);
  const [sealed, setSealed] = useState(false);
  const [takeError, setTakeError] = useState<string | null>(null);

  /**
   * Taking a campaign claims a referral code in the registry — an on-chain act, and
   * the tasker's to authorise. We ask the server to prepare it, then hand the
   * challenge to Circle's UI where they approve with their PIN. Vane cannot sign it.
   *
   * If the campaign was never funded on-chain (seeded demo data), the take is still
   * recorded and the link still works; it just isn't sealed, and we don't claim it is.
   */
  async function take() {
    setTaking(true);
    setTakeError(null);
    try {
      const res = await fetch(`/api/campaigns/${id}/take`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not take this campaign.");

      setTakeLink(data.link ?? null);

      if (data.challenge) {
        await approve(data.challenge);
        setSealed(true);
      }
      setStage("taken");
    } catch (err) {
      setTakeError((err as Error).message);
    } finally {
      setTaking(false);
    }
  }

  // The real code comes back from the take; the placeholder only ever shows before one exists.
  const link = takeLink ?? `vane.money/r/${(c?.business ?? "").toLowerCase().replace(/\s+/g, "")}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(`https://${link}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  // No campaign, no page. Previously this rendered someone else's listing instead.
  if (!c) {
    return (
      <main className="screen">
        <AppBar />
        <Link href="/tasks" className="backlink">
          &larr; Marketplace
        </Link>
        <p className="sub" style={{ marginTop: 40 }}>
          {missing ? "That campaign no longer exists." : "Loading…"}
        </p>
        <TabBar />
      </main>
    );
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

          {/* Real counts. A promoter deciding whether to take this needs to know it is
              new if it is new — a seeded "94% approved" on a campaign that has never
              paid anyone is exactly the kind of thing they'd take it on and regret. */}
          <Block title="How this campaign is performing">
            <div className="statgrid">
              <Stat v={String(perf?.promoters ?? 0)} l="promoters active" />
              <Stat v={usd(perf?.totalPaid ?? c.spent, { cents: false })} l="paid out so far" />
              <Stat v={String(perf?.results ?? 0)} l="results verified" />
              <Stat v={usd(remaining(c), { cents: false })} l="still funded" />
            </div>
            {perf && perf.promoters === 0 && (
              <p className="tiny" style={{ marginTop: 12 }}>
                Nobody has taken this yet — you&rsquo;d be first.
              </p>
            )}
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
            <Link
              href={`/business/${slugFor(c.business)}`}
              className="tiny"
              style={{ display: "inline-block", marginTop: 12, color: "var(--amber)", fontWeight: 700 }}
            >
              View {c.business}&rsquo;s profile →
            </Link>
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
                    <button className="btn btn-amber" onClick={() => void take()} disabled={taking}>
                      {taking ? "Confirm in your wallet…" : "Agree & get my link"}
                    </button>
                    {takeError && <p className="wallet-error" style={{ marginTop: 10 }}>{takeError}</p>}
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
                    <span className="tiny">
                      {sealed
                        ? "Your code is sealed on Arc — attribution can't be rewritten."
                        : "Share your link — earnings start on the first result."}
                    </span>
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
