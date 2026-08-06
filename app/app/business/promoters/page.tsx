"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppBar, TabBar } from "../../../components/AppChrome";
import { usd } from "../../../lib/data";

/**
 * The people working for this business.
 *
 * This was a list squeezed into a corner of the dashboard, which is fine for three
 * promoters and useless for fifty. A business paying per result wants to know who is
 * producing them, who is converting well, and who is not — that is a screen, not a
 * sidebar.
 *
 * Deliberately limited to what a business has a right to see about someone working
 * for it: a name, their record here, what they have earned. Not their email, not their
 * other campaigns, not their balance.
 */

interface Promoter {
  id: string;
  name: string;
  avatar: string;
  reputation: number;
  clicks: number;
  results: number;
  earned: number;
  campaigns: number;
  since: number;
  conversion: number | null;
}

type Sort = "earned" | "results" | "conversion";

export default function Promoters() {
  const [promoters, setPromoters] = useState<Promoter[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [sort, setSort] = useState<Sort>("earned");

  useEffect(() => {
    let live = true;
    fetch("/api/business/promoters")
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        if (Array.isArray(d.promoters)) setPromoters(d.promoters);
        else setFailed(true);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const sorted = [...(promoters ?? [])].sort((a, b) => {
    if (sort === "results") return b.results - a.results;
    if (sort === "conversion") return (b.conversion ?? -1) - (a.conversion ?? -1);
    return b.earned - a.earned;
  });

  const totalPaid = (promoters ?? []).reduce((n, p) => n + p.earned, 0);
  const totalResults = (promoters ?? []).reduce((n, p) => n + p.results, 0);

  return (
    <main className="screen">
      <AppBar />

      <header className="biz-head">
        <div>
          <h1 className="fade-up" style={{ fontSize: 28, lineHeight: 1.1 }}>
            Promoters
          </h1>
          <p className="sub fade-up d1" style={{ fontSize: 13.5, marginTop: 6 }}>
            {promoters && promoters.length > 0
              ? `${promoters.length} working for you · ${totalResults} results · ${usd(totalPaid)} paid`
              : "Everyone promoting your campaigns, and what each has driven."}
          </p>
        </div>
        {promoters && promoters.length > 1 && (
          <label className="mk-sort">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="earned">Most earned</option>
              <option value="results">Most results</option>
              <option value="conversion">Best conversion</option>
            </select>
          </label>
        )}
      </header>

      {promoters === null && !failed && <p className="sub">Loading…</p>}

      {failed && (
        <section className="card fade-up" style={{ textAlign: "center", padding: "28px 22px" }}>
          <b style={{ fontSize: 16, display: "block", marginBottom: 8 }}>Couldn&rsquo;t load your promoters</b>
          <p className="sub" style={{ fontSize: 14 }}>A connection problem, not a lost promoter.</p>
          <button className="btn btn-amber" style={{ marginTop: 16, maxWidth: 220, marginInline: "auto" }} onClick={() => location.reload()}>
            Try again
          </button>
        </section>
      )}

      {promoters !== null && promoters.length === 0 && (
        <section className="card fade-up" style={{ textAlign: "center", padding: "34px 22px" }}>
          <b style={{ fontSize: 17, display: "block", marginBottom: 8 }}>Nobody has taken your campaigns yet</b>
          <p className="sub" style={{ fontSize: 14, maxWidth: "42ch", marginInline: "auto" }}>
            Promoters find work in the marketplace. A clear result and a rate worth someone&rsquo;s time are what
            get a campaign taken.
          </p>
          <Link href="/post" className="btn btn-amber" style={{ marginTop: 20, maxWidth: 280, marginInline: "auto" }}>
            Post a campaign
          </Link>
        </section>
      )}

      {sorted.length > 0 && (
        <div className="promoters fade-up d1">
          {sorted.map((p) => (
            <article key={p.id} className="promoter">
              <div className="promoter-who">
                {p.avatar ? (
                  <span className="face-ring" style={{ padding: 2 }}>
                    <img className="face" src={p.avatar} alt="" width={38} height={38} />
                  </span>
                ) : (
                  <span className="avatar" style={{ width: 38, height: 38, fontSize: 15 }} aria-hidden="true">
                    {p.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div style={{ minWidth: 0 }}>
                  <b style={{ display: "block", fontSize: 15 }}>{p.name}</b>
                  <span className="tiny">
                    {p.campaigns} campaign{p.campaigns === 1 ? "" : "s"} · reputation {p.reputation}
                  </span>
                </div>
              </div>

              <div className="promoter-figs">
                <div>
                  <b className="num">{p.clicks.toLocaleString()}</b>
                  <span>clicks</span>
                </div>
                <div>
                  <b className="num">{p.results}</b>
                  <span>verified</span>
                </div>
                <div>
                  <b className="num">{p.conversion === null ? "—" : `${p.conversion}%`}</b>
                  <span>convert</span>
                </div>
                <div>
                  <b className="num" style={{ color: "var(--amber)" }}>
                    {usd(p.earned)}
                  </b>
                  <span>earned</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <TabBar />
    </main>
  );
}
