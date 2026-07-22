"use client";

import { useState } from "react";
import Link from "next/link";
import { Mark } from "../../../components/Falcon";

/**
 * Promoter onboarding — one screen, one field.
 * The payout account is created silently; it is never mentioned as a wallet.
 */
export default function TaskerJoin() {
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);
  const valid = /.+@.+\..+/.test(email);

  return (
    <main className="screen" style={{ justifyContent: "center", paddingBottom: 40 }}>
      <span className="row fade-up" style={{ gap: 10, marginBottom: 32 }}>
        <Mark size={24} color="var(--amber)" />
        <b style={{ fontSize: 23, letterSpacing: "-.04em" }}>vane</b>
      </span>

      {!joined ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) setJoined(true);
          }}
        >
          <h1 className="fade-up" style={{ fontSize: 32, lineHeight: 1.06 }}>
            One thing, and you&rsquo;re in
          </h1>
          <p className="sub fade-up d1" style={{ fontSize: 14.5, marginTop: 10, marginBottom: 26 }}>
            Start earning in the next minute.
          </p>

          <div className="card fade-up d2" style={{ marginBottom: 14 }}>
            <label htmlFor="email" className="eyebrow">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              style={{
                display: "block",
                width: "100%",
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 17,
                fontWeight: 600,
                marginTop: 5,
                color: "var(--ink)",
              }}
            />
          </div>

          <button
            type="submit"
            className="btn btn-amber fade-up d3"
            disabled={!valid}
            style={{ opacity: valid ? 1 : 0.4 }}
          >
            Start earning
          </button>

          <p className="tiny fade-up d4" style={{ textAlign: "center", marginTop: 20, lineHeight: 1.55 }}>
            Your payout account is created automatically.
            <br />
            No forms. No setup. Ever.
          </p>
        </form>
      ) : (
        <div>
          <h1 className="fade-up" style={{ fontSize: 32, lineHeight: 1.06 }}>
            You&rsquo;re in
          </h1>
          <p className="sub fade-up d1" style={{ fontSize: 14.5, marginTop: 10, marginBottom: 22 }}>
            Payouts land in seconds, in dollars, with no minimum.
          </p>

          <div className="card fade-up d2" style={{ marginBottom: 22 }}>
            <span className="row" style={{ gap: 13 }}>
              <span className="dot dot-ok" aria-hidden="true">
                ✓
              </span>
              <span>
                <b style={{ fontSize: 14.5, display: "block" }}>Payout account ready</b>
                <span className="tiny">Created for you. Nothing to set up.</span>
              </span>
            </span>
          </div>

          <Link href="/tasks" className="btn btn-amber fade-up d3">
            Find your first campaign
          </Link>
        </div>
      )}
    </main>
  );
}
