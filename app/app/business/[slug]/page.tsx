"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppBar, TabBar } from "../../../components/AppChrome";
import {
  businessBySlug,
  businesses,
  campaignById,
  usd,
  rate,
  rateNote,
  poolPercent,
  remaining,
  daysLeft,
} from "../../../lib/data";

/**
 * Public business profile — a business as a findable entity.
 *
 * Linked from every campaign's "About the business". Shows the settlement record
 * a promoter would want before trusting a campaign, plus everything the business
 * currently has open.
 */
export default function BusinessProfile() {
  const params = useParams<{ slug: string }>();
  const b = businessBySlug(params?.slug ?? "") ?? businesses[0];
  const open = b.campaignIds.map(campaignById).filter(Boolean);

  return (
    <main className="screen">
      <AppBar />

      <Link href="/tasks" className="backlink">
        ← Marketplace
      </Link>

      <header className="acct-head fade-up">
        <span className="avatar" style={{ background: b.colour, width: 64, height: 64, fontSize: 24 }} aria-hidden="true">
          {b.initial}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <h1 style={{ fontSize: 25, letterSpacing: "-.02em" }}>{b.name}</h1>
            {b.bonded && <span className="badge badge-bonded">Bonded</span>}
          </div>
          <p className="tiny" style={{ marginTop: 3 }}>
            {b.blurb} · {b.kind === "web3" ? "Onchain business" : "Web business"} · since {b.since}
          </p>
        </div>
      </header>

      <section className="statgrid fade-up d1" style={{ margin: "24px 0 16px" }}>
        <div>
          <b className="num">{usd(b.totalFunded, { cents: false })}</b>
          <span>funded all time</span>
        </div>
        <div>
          <b className="num">{usd(b.totalPaid, { cents: false })}</b>
          <span>paid to taskers</span>
        </div>
        <div>
          <b className="num">{Math.round(b.approvalRate * 100)}%</b>
          <span>results approved</span>
        </div>
        <div>
          <b className="num">{b.disputes}</b>
          <span>disputes raised</span>
        </div>
      </section>

      <p className="body fade-up d2" style={{ marginBottom: 26 }}>
        {b.kind === "web3"
          ? `${b.name}'s results settle onchain, so every payout is verified against the chain with nobody's word taken for it.`
          : `${b.name} reports results to Vane through a verified integration. The agent checks each claim and the bonded deposit backs any dispute.`}
      </p>

      <section className="fade-up d3">
        <div className="sec-head">
          <span>Open campaigns</span>
          <span className="tiny">{open.length} live</span>
        </div>

        <div className="cards" style={{ display: "grid", gap: 13 }}>
          {open.map(
            (c) =>
              c && (
                <Link key={c.id} href={`/campaign/${c.id}`} className="mk-card">
                  <div className="you-earn" style={{ marginBottom: 4 }}>
                    <span className="you-earn-rate num">{rate(c)}</span>
                    <span className="you-earn-note">{rateNote(c)}</span>
                  </div>
                  <div className="poolbar" style={{ marginTop: 12 }}>
                    <i style={{ width: `${poolPercent(c)}%` }} />
                  </div>
                  <div className="row" style={{ justifyContent: "space-between", marginTop: 9 }}>
                    <span className="tiny num">{usd(remaining(c), { cents: false })} funded</span>
                    <span className="tiny num">{daysLeft(c)} days left</span>
                  </div>
                </Link>
              ),
          )}
        </div>
      </section>

      <TabBar />
    </main>
  );
}
