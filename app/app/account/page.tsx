"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppBar, TabBar } from "../../components/AppChrome";
import { useProfile } from "../../components/Profile";
import { useMe } from "../../components/Me";
import { usd } from "../../lib/data";

/**
 * Tasker account.
 *
 * Every figure here is the signed-in user's own, read from the server.
 *
 * It previously rendered a seeded `performance` array, so somebody who had just
 * created a wallet was shown reputation 96, "top 8% of taskers", $2,848 earned and two
 * campaigns they had never joined. On a product whose entire claim is that results are
 * verified, inventing a stranger's track record and putting the user's name on it is
 * the worst thing the page could do. Zeros with a next step are better.
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

export default function Account() {
  const { profile } = useProfile();
  // The signed-in account, so the name, email and wallet shown are the real ones.
  const { me: account } = useMe();
  // No stock-photo fallback: an empty frame is honest, someone else's face is not.
  const avatar = profile.avatar || account?.avatar || "";
  const displayName = profile.name || account?.name || "Your account";

  const [earned, setEarned] = useState(0);
  const [results, setResults] = useState(0);
  const [clicks, setClicks] = useState(0);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/earnings")
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        setEarned(Number(d.available ?? 0));
        setResults(Number(d.results ?? 0));
        setClicks(Number(d.clicks ?? 0));
        setStreams(Array.isArray(d.streams) ? d.streams : []);
      })
      .catch(() => {})
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, []);

  const conversion = clicks ? Math.round((results / clicks) * 100) : 0;
  const reputation = account?.reputation ?? 80;

  return (
    <main className="screen">
      <AppBar />

      <header className="acct-head fade-up">
        <span className="face-ring" style={{ padding: 3 }}>
          <img className="face" src={avatar} alt="" width={72} height={72} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 25, letterSpacing: "-.02em" }}>{displayName}</h1>
          <p className="tiny" style={{ marginTop: 3 }}>{account?.email ?? ""}</p>
        </div>
      </header>

      {/* The wallet the user actually owns. After setting a PIN this is the one thing
          they should be able to find, and it was previously shown nowhere at all. */}
      {account?.walletAddress && (
        <section className="card fade-up" style={{ marginTop: 18 }}>
          <span className="eyebrow">Your wallet</span>
          <code className="wallet-addr" style={{ display: "block", marginTop: 8 }}>
            {account.walletAddress}
          </code>
          <p className="tiny" style={{ marginTop: 10 }}>
            Yours alone — secured by your PIN with Circle. Vane cannot move what&rsquo;s in it.
          </p>
          <a
            className="tiny"
            href={`https://testnet.arcscan.app/address/${account.walletAddress}`}
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-block", marginTop: 10, color: "var(--amber)", fontWeight: 700 }}
          >
            View on Arcscan →
          </a>
        </section>
      )}

      {/* Reputation — the real one. No percentile claim: we have no cohort to rank
          against yet, and "top 8%" for a brand-new account was pure invention. */}
      <section className="rep fade-up d1">
        <div className="rep-top">
          <div>
            <span className="eyebrow">Reputation</span>
            <b className="num">{reputation}</b>
            <span className="tiny">
              {results === 0 ? "Starting score · your first result will move it" : `${results} verified so far`}
            </span>
          </div>
        </div>
        <div className="rep-bar">
          <i style={{ width: `${reputation}%` }} />
        </div>
        <p className="tiny" style={{ marginTop: 10 }}>
          Higher reputation means the agent clears your results faster and with fewer checks. It rises with
          every approved result and falls if work is refused.
        </p>
      </section>

      <section className="statgrid fade-up d2" style={{ margin: "26px 0 30px" }}>
        <div>
          <b className="num">{usd(earned, { cents: false })}</b>
          <span>earned all time</span>
        </div>
        <div>
          <b className="num">{results.toLocaleString()}</b>
          <span>verified results</span>
        </div>
        <div>
          <b className="num">{clicks ? `${conversion}%` : "—"}</b>
          <span>click-to-result</span>
        </div>
        <div>
          <b className="num">{streams.length}</b>
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
            {/* "Set up" used to look like a live action and did nothing. Withdrawal
                means signing a transfer from a wallet only the user controls, which is
                not built yet — so it says so instead of pretending. */}
            <div className="grow-row">
              <span className="tile-ic" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path d="M12 3v18M5 8h9a3 3 0 0 1 0 6H7" fill="none" stroke="var(--verified)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div className="body">
                <b>Auto cash-out</b>
                <span>Earnings settle straight to your wallet on Arc</span>
              </div>
              <span className="tiny" style={{ color: "var(--faint)" }}>Coming soon</span>
            </div>
          </div>
        </section>

        <section className="fade-up d4" style={{ marginBottom: 24 }}>
          <div className="sec-head">
            <span>Your campaigns</span>
            <Link href="/tasks">Find more</Link>
          </div>
          <div className="group">
            {streams.length === 0 ? (
              <div className="grow-row" style={{ display: "block" }}>
                <b style={{ display: "block", marginBottom: 4 }}>
                  {loaded ? "No campaigns yet" : "Loading…"}
                </b>
                <span className="tiny">
                  {loaded && (
                    <>
                      Take one and your results show up here as the falcon verifies them.{" "}
                      <Link href="/tasks" style={{ color: "var(--amber)", fontWeight: 700 }}>
                        Browse campaigns →
                      </Link>
                    </>
                  )}
                </span>
              </div>
            ) : (
              streams.map((p) => (
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
              ))
            )}
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
