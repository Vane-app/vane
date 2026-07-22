"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Mark } from "../components/Falcon";

/**
 * Homepage.
 *
 * The hero photograph carries the page — everything under it stays short, so the
 * site reads as one piece rather than a stack of paragraphs and boxes.
 */

const AUDIENCE = [
  { t: "Creators", d: "Paid the same day, not the same quarter." },
  { t: "Newsletters", d: "Earn on every reader who signs up." },
  { t: "Communities", d: "Paid per real member you bring." },
  { t: "Agencies", d: "Campaigns that reconcile themselves." },
  { t: "Affiliates", d: "Keep the whole rate. No network cut." },
  { t: "Businesses", d: "Buy outcomes, not impressions." },
];

const STEPS = [
  { t: "Locked", d: "The budget sits in escrow before anyone promotes." },
  { t: "Proven", d: "Your link is recorded before the customer converts." },
  { t: "Paid", d: "Verified results settle in about a second." },
];

const FAQS = [
  {
    q: "How do I know the business will pay?",
    a: "They already have. A campaign only appears once its budget is locked in escrow, and you can see the balance on the card. Vane cannot move it and neither can they.",
  },
  {
    q: "What counts as a result?",
    a: "Whatever the business funded: a signup, a first deposit, a subscription, or a share of every trade. Your link is recorded before the customer converts.",
  },
  {
    q: "How fast is the payout?",
    a: "About a second after the result is verified. No minimum, no payout fee, no month end.",
  },
  {
    q: "What stops fake results?",
    a: "An agent checks each claim against onchain evidence and refuses the bad ones in writing, which keeps the budget intact for everyone else.",
  },
  {
    q: "Do I need to understand crypto?",
    a: "No. Sign up with an email and see everything in dollars. Settlement happens underneath.",
  },
];

export default function Homepage() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="hp">
      <header className="hp-nav">
        <Link href="/" className="row" style={{ gap: 9 }}>
          <span className="logo-tile" style={{ width: 32, height: 32, borderRadius: 10 }}>
            <Mark size={17} color="var(--amber)" />
          </span>
          <b style={{ fontSize: 21, letterSpacing: "-.04em" }}>vane</b>
        </Link>
        <nav className="hp-links" aria-label="Main">
          <a href="#who">Who it&rsquo;s for</a>
          <a href="#how">How it works</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="row" style={{ gap: 8 }}>
          <Link href="/start" className="hp-login">
            Log in
          </Link>
          <Link href="/join/tasker" className="hp-getstarted">
            Get started
          </Link>
        </div>
      </header>

      <section className="hp-hero-c">
        <p className="hp-kicker">Escrowed campaigns, settled onchain</p>
        <h1 className="hp-h1">Get paid in seconds</h1>
        <p className="hp-lede">
          Take a campaign, bring real customers, get paid the moment each result is verified.
        </p>
        <Link href="/join/tasker" className="hp-primary">
          Take my first campaign
        </Link>
        <p className="hp-feeline">
          Promoters keep <b>100%</b> &nbsp;·&nbsp; businesses pay <b>2.5%</b> on settled results
        </p>
      </section>

      {/* the photograph carries the page */}
      <div className="hp-shot">
        <Image
          src="/hero-vane.png"
          alt="The Vane app open on a phone, showing a balance and recent payouts"
          width={1080}
          height={1440}
          priority
          sizes="(max-width: 700px) 92vw, 620px"
        />
      </div>

      <section className="hp-sec" id="how">
        <p className="hp-eyebrow">How it works</p>
        <h2 className="hp-h2">Nobody has to trust anybody</h2>
        <div className="hp-problems">
          {STEPS.map((s) => (
            <article key={s.t}>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </article>
          ))}
        </div>
      </section>

      <figure className="hp-quote-lead">
        <blockquote>
          &ldquo;I shared a link on Tuesday morning and watched the money land while I was still replying to
          comments.&rdquo;
        </blockquote>
        <figcaption>Tunde A., creator</figcaption>
      </figure>

      <section className="hp-sec" id="who">
        <p className="hp-eyebrow">Who it&rsquo;s for</p>
        <h2 className="hp-h2">For people who bring customers, not clicks</h2>
        <div className="hp-audience">
          {AUDIENCE.map((a) => (
            <article key={a.t}>
              <h3>{a.t}</h3>
              <p>{a.d}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="hp-sec" id="faq">
        <p className="hp-eyebrow">FAQ</p>
        <h2 className="hp-h2">Questions people ask first</h2>
        <div className="hp-faq">
          {FAQS.map((f, i) => (
            <div key={f.q} className={`faq ${open === i ? "faq-open" : ""}`}>
              <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                <span>{f.q}</span>
                <i aria-hidden="true" />
              </button>
              {open === i && <p>{f.a}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="hp-close">
        <h2 className="hp-h1" style={{ maxWidth: "14ch" }}>
          Money that arrives when the work does
        </h2>
        <Link href="/start" className="hp-primary">
          Get started
        </Link>
      </section>

      <footer className="ft">
        <div className="ft-top">
          <div className="ft-brand">
            <div className="row" style={{ gap: 9, marginBottom: 14 }}>
              <span className="logo-tile" style={{ width: 30, height: 30, borderRadius: 10 }}>
                <Mark size={16} color="var(--amber)" />
              </span>
              <b style={{ fontSize: 18, letterSpacing: "-.04em" }}>vane</b>
            </div>
            <p>
              Escrowed campaigns, verified results, and payouts that land in seconds. Built on Arc, settled in
              USDC.
            </p>
          </div>

          <div className="ft-col">
            <h4>Product</h4>
            <Link href="/tasks">Browse campaigns</Link>
            <Link href="/join/business">For businesses</Link>
            <Link href="/join/tasker">For promoters</Link>
            <Link href="/business">Campaign dashboard</Link>
          </div>

          <div className="ft-col">
            <h4>Learn</h4>
            <a href="#how">How it works</a>
            <a href="#who">Who it&rsquo;s for</a>
            <a href="#faq">Questions</a>
            <a href="https://docs.arc.io" target="_blank" rel="noreferrer">
              Arc documentation
            </a>
          </div>

          <div className="ft-col">
            <h4>Company</h4>
            <Link href="/start">Get started</Link>
            <a href="mailto:hello@vane.money">Contact</a>
            <a href="https://github.com/Vane-app/vane" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>
        </div>

        <div className="ft-bottom">
          <span>© 2026 Vane</span>
          <span>Testnet software. Not audited. Do not use with real funds.</span>
        </div>
      </footer>
    </div>
  );
}
