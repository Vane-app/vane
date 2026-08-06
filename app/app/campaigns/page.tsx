"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppBar, TabBar } from "../../components/AppChrome";
import { usd } from "../../lib/data";

/**
 * My campaigns — the promoter's working screen.
 *
 * This was missing entirely. A referral link only existed on the campaign page it was
 * claimed from, so anyone who navigated away had no way back to their own link. That
 * is the one thing a promoter needs every day.
 *
 * It also carries the state of the campaign behind each link. A promoter sharing a
 * link for something that has been paused, has run dry, or has ended is working for
 * nothing — and would have no way to find that out.
 *
 * Browse is for finding work. This is the work in hand. Earnings is the money.
 */

interface Stream {
  takeId: string;
  refCode: string;
  link: string;
  campaignId: number;
  business: string;
  initial: string;
  colour: string;
  rewardPerAction: number;
  rateLabel: string | null;
  clicks: number;
  results: number;
  earned: number;
  takenAt: number;
  status: string;
  live: boolean;
  budgetLeft: number;
  resultsLeft: number;
  daysLeft: number;
}

/** Why a link might not be worth sharing right now, in one line. */
function warning(s: Stream): string | null {
  if (s.status === "paused") return "Paused by the business — new results won't be paid until it resumes.";
  if (s.status === "ended" || s.status === "cancelled" || s.status === "expired")
    return "This campaign has closed. Results already verified were paid.";
  if (s.resultsLeft === 0) return "Budget spent — there's nothing left to pay out.";
  if (s.daysLeft === 0) return "Ends today.";
  if (s.resultsLeft <= 3) return `Only ${s.resultsLeft} result${s.resultsLeft === 1 ? "" : "s"} left in the budget.`;
  return null;
}

export default function MyCampaigns() {
  const [streams, setStreams] = useState<Stream[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/earnings")
        .then((r) => r.json())
        .then((d) => live && setStreams(Array.isArray(d.streams) ? d.streams : []))
        .catch(() => live && setStreams([]));
    void load();
    const t = setInterval(load, 20_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  async function copy(s: Stream) {
    try {
      await navigator.clipboard.writeText(`https://${s.link}`);
      setCopied(s.takeId);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  async function share(s: Stream) {
    const url = `https://${s.link}`;
    // The native sheet is what a phone user expects; desktop falls back to copying.
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({
          title: s.business,
          text: `Check out ${s.business}`,
          url,
        });
        return;
      } catch {
        // Cancelled or unsupported — fall through to copying.
      }
    }
    void copy(s);
  }

  const totalEarned = (streams ?? []).reduce((n, s) => n + s.earned, 0);
  const totalResults = (streams ?? []).reduce((n, s) => n + s.results, 0);

  return (
    <main className="screen">
      <AppBar />

      <header className="biz-head">
        <div>
          <h1 className="fade-up" style={{ fontSize: 28, lineHeight: 1.1 }}>
            My campaigns
          </h1>
          <p className="sub fade-up d1" style={{ fontSize: 13.5, marginTop: 6 }}>
            {streams && streams.length > 0
              ? `${streams.length} link${streams.length === 1 ? "" : "s"} · ${totalResults} verified · ${usd(totalEarned)} earned`
              : "Your links, and what each one has earned."}
          </p>
        </div>
        <Link href="/tasks" className="btn btn-amber biz-post">
          Find more work
        </Link>
      </header>

      {streams === null && <p className="sub">Loading…</p>}

      {streams !== null && streams.length === 0 && (
        <section className="card fade-up" style={{ textAlign: "center", padding: "34px 22px" }}>
          <b style={{ fontSize: 17, display: "block", marginBottom: 8 }}>You haven&rsquo;t taken a campaign yet</b>
          <p className="sub" style={{ fontSize: 14, maxWidth: "40ch", marginInline: "auto" }}>
            Pick one from the marketplace and you&rsquo;ll get a referral link here straight away. Free to take, no
            approval queue.
          </p>
          <Link href="/tasks" className="btn btn-amber" style={{ marginTop: 20, maxWidth: 300, marginInline: "auto" }}>
            Browse campaigns
          </Link>
        </section>
      )}

      {streams !== null && streams.length > 0 && (
        <div className="mycamps fade-up d1">
          {streams.map((s) => {
            const warn = warning(s);
            return (
              <article key={s.takeId} className={`mycamp ${s.live ? "" : "is-off"}`}>
                <div className="mycamp-head">
                  <span
                    className="avatar"
                    style={{ background: s.colour, width: 34, height: 34, fontSize: 13 }}
                    aria-hidden="true"
                  >
                    {s.initial}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ display: "block", fontSize: 15 }}>
                      {s.business}
                      {s.live && <i className="livedot" />}
                    </b>
                    <span className="tiny">{s.rateLabel || usd(s.rewardPerAction)} per verified result</span>
                  </div>
                  {!s.live && <span className="biz-status">{s.status}</span>}
                </div>

                {warn && <p className="mycamp-warn">{warn}</p>}

                <div className="mycamp-link">
                  <span className="num">{s.link}</span>
                  <button className="mycamp-copy" onClick={() => void copy(s)}>
                    {copied === s.takeId ? "Copied" : "Copy"}
                  </button>
                  <button className="mycamp-share" onClick={() => void share(s)} aria-label="Share this link">
                    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                      <path
                        d="M12 15V4m0 0L8 8m4-4 4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>

                <div className="mycamp-stats">
                  <div>
                    <b className="num">{s.clicks.toLocaleString()}</b>
                    <span>clicks</span>
                  </div>
                  <div>
                    <b className="num">{s.results}</b>
                    <span>verified</span>
                  </div>
                  <div>
                    <b className="num">{usd(s.earned)}</b>
                    <span>earned</span>
                  </div>
                </div>

                <div className="mycamp-foot">
                  <span className="tiny">
                    {s.live ? `${s.resultsLeft} results left · ${s.daysLeft}d` : "Closed"}
                  </span>
                  <Link href={`/campaign/${s.campaignId}`} className="tiny mycamp-details">
                    What counts →
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <TabBar />
    </main>
  );
}
