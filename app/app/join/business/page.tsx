"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Falcon, Mark } from "../../../components/Falcon";
import { usd, FEE_BPS } from "../../../lib/data";

/**
 * Business onboarding.
 *
 * The falcon carries the conversation; the user mostly taps. One question per
 * turn, nothing asked before it is needed, and the wallet is created silently in
 * the background — it is never mentioned, because it is not the user's problem.
 */

type Turn = { from: "vane" | "user"; text: string };

interface Step {
  ask: string;
  options?: string[];
  placeholder?: string;
  key: "name" | "goal" | "rate" | "budget";
}

const SCRIPT: Step[] = [
  { ask: "Welcome. What should I call your business?", placeholder: "Your business name", key: "name" },
  {
    ask: "Nice to meet you. What result do you want to pay for?",
    options: ["New signups", "First deposit", "Every trade", "Subscriptions"],
    key: "goal",
  },
  {
    ask: "How much per verified result? Campaigns like yours usually pay $1.50 to $3.00.",
    options: ["$1.50", "$2.00", "$3.00"],
    key: "rate",
  },
  {
    ask: "And how much would you like to put behind it? This is held safely and only spent on verified results.",
    options: ["$250", "$500", "$1,000"],
    key: "budget",
  },
];

export default function BusinessOnboarding() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [step, setStep] = useState(0);
  const [typing, setTyping] = useState(true);
  const [draft, setDraft] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const endRef = useRef<HTMLDivElement>(null);

  const current = SCRIPT[step];
  const done = step >= SCRIPT.length;

  // The falcon takes a beat before speaking, so it reads as thought rather than a form.
  useEffect(() => {
    if (done) return;
    setTyping(true);
    const t = setTimeout(() => {
      setTyping(false);
      setTurns((prev) => [...prev, { from: "vane", text: SCRIPT[step].ask }]);
    }, 620);
    return () => clearTimeout(t);
  }, [step, done]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, typing]);

  function answer(value: string) {
    if (!value.trim() || typing) return;
    setTurns((prev) => [...prev, { from: "user", text: value }]);
    setAnswers((prev) => ({ ...prev, [current.key]: value }));
    setDraft("");
    setStep((s) => s + 1);
  }

  const rate = Number((answers.rate ?? "$2.00").replace(/[^0-9.]/g, "")) || 2;
  const budget = Number((answers.budget ?? "$500").replace(/[^0-9.]/g, "")) || 500;
  const results = Math.floor(budget / rate);
  const fee = (budget * FEE_BPS) / 10_000;

  return (
    <main className="screen" style={{ paddingBottom: 24 }}>
      <header className="row" style={{ gap: 11, padding: "18px 0 14px" }}>
        <Link href="/" aria-label="Back" style={{ display: "grid", placeItems: "center" }}>
          <Mark size={22} color="var(--ink)" />
        </Link>
        <div>
          <b style={{ fontSize: 15.5 }}>Vane</b>
          <span style={{ display: "block", fontSize: 11.5, color: "var(--verified)", fontWeight: 700 }}>
            setting you up
          </span>
        </div>
      </header>

      <div className="stack grow" style={{ gap: 10, paddingBottom: 12 }}>
        {turns.map((t, i) => (
          <div key={i} className={`bubble bubble-${t.from}`}>
            {t.text}
          </div>
        ))}

        {typing && !done && (
          <div className="typing" aria-label="Vane is typing">
            <i />
            <i />
            <i />
          </div>
        )}

        {!typing && !done && current.options && (
          <div className="chips">
            {current.options.map((o) => (
              <button key={o} className="chip" onClick={() => answer(o)}>
                {o}
              </button>
            ))}
          </div>
        )}

        {done && (
          <div className="card fade-up" style={{ marginTop: 8 }}>
            <div className="row" style={{ gap: 12, marginBottom: 14 }}>
              <Falcon mode="idle" size={54} />
              <div>
                <b style={{ fontSize: 15 }}>Here is your campaign</b>
                <span className="tiny" style={{ display: "block" }}>
                  {answers.name ?? "Your business"} · {(answers.goal ?? "New signups").toLowerCase()}
                </span>
              </div>
            </div>

            <Term label="Pays" value={`${usd(rate * 1_000_000)} per verified result`} />
            <Term label="Budget" value={`${usd(budget * 1_000_000, { cents: false })}, held safely`} />
            <Term label="Buys you" value={`up to ${results} verified results`} />
            <Term label="Vane's fee" value={`${usd(fee * 1_000_000)} — only on results`} />
            <Term label="If unused" value="Money returns to you" />
            <Term label="Cancel anytime" value="Earned payouts honoured" last />
          </div>
        )}

        <div ref={endRef} />
      </div>

      {done ? (
        <div className="stack" style={{ gap: 10 }}>
          <Link href="/business" className="btn btn-amber">
            Lock {usd(budget * 1_000_000, { cents: false })} and go live
          </Link>
          <p className="tiny" style={{ textAlign: "center" }}>
            Held in escrow until results are verified. Not even Vane can move it.
          </p>
        </div>
      ) : (
        !current?.options && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              answer(draft);
            }}
            className="row"
            style={{
              gap: 10,
              background: "var(--surface)",
              borderRadius: 100,
              padding: "8px 8px 8px 20px",
              boxShadow: "inset 0 0 0 1px var(--line)",
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={current?.placeholder ?? "Type your answer"}
              aria-label={current?.ask}
              autoFocus
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 15 }}
            />
            <button
              type="submit"
              aria-label="Send"
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "linear-gradient(180deg,#f5b862,var(--amber))",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                <path d="M4 12 L20 5 L14 20 L11.5 13.5 Z" fill="#23160a" />
              </svg>
            </button>
          </form>
        )
      )}
    </main>
  );
}

function Term({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className="row"
      style={{
        justifyContent: "space-between",
        gap: 14,
        padding: "12px 0",
        borderBottom: last ? "none" : "1px solid var(--line)",
        fontSize: 13.5,
      }}
    >
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <b className="num" style={{ textAlign: "right" }}>
        {value}
      </b>
    </div>
  );
}
