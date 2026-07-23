"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mark } from "../../components/Falcon";
import { Mascot } from "../../components/Mascot";

/**
 * The payout moment.
 *
 * The one screen that stops and celebrates. The agent shows its work in three
 * lines, because the point is not only that money arrived — it is that you can
 * see why it was allowed to.
 */

const CHECKS = ["Referral traced to your link", "Real, active account — not a bot", "Your track record: instant payout"];

export default function Paid() {
  const [amountIn, setAmountIn] = useState(false);
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setAmountIn(true), 420),
      ...CHECKS.map((_, i) => setTimeout(() => setRevealed(i + 1), 1000 + i * 360)),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <main className="screen" style={{ justifyContent: "center", textAlign: "center", paddingBottom: 36 }}>
      <span className="row fade-up" style={{ gap: 9, justifyContent: "center", marginBottom: 18 }}>
        <Mark size={20} color="var(--amber)" />
        <b style={{ fontSize: 19, letterSpacing: "-.04em" }}>vane</b>
      </span>

      <div
        className="paid-falcon"
        style={{
          margin: "0 auto",
          transition: "opacity .7s var(--ease), transform .7s var(--ease)",
          opacity: amountIn ? 1 : 0,
          transform: amountIn ? "none" : "translateX(-30%) scale(.9)",
        }}
      >
        <Mascot state="approving" size={150} priority />
      </div>

      <div
        style={{
          transition: "opacity .6s var(--ease) .2s, transform .6s var(--ease) .2s",
          opacity: amountIn ? 1 : 0,
          transform: amountIn ? "none" : "translateY(16px) scale(.94)",
        }}
      >
        <span
          className="dot dot-ok"
          style={{ width: 56, height: 56, fontSize: 24, margin: "0 auto 20px" }}
          aria-hidden="true"
        >
          ✓
        </span>
        <b className="money num" style={{ fontSize: 54 }}>
          $2.00
        </b>
        <p className="sub" style={{ marginTop: 10, fontSize: 15 }}>
          landed in your balance
        </p>
      </div>

      <div className="group" style={{ marginTop: 34, textAlign: "left", padding: "6px 18px" }}>
        {CHECKS.map((c, i) => (
          <div
            key={c}
            className="grow-row"
            style={{
              opacity: revealed > i ? 1 : 0,
              transform: revealed > i ? "none" : "translateX(-8px)",
              transition: "opacity .45s var(--ease), transform .45s var(--ease)",
            }}
          >
            <span style={{ color: "var(--verified)", fontWeight: 800 }} aria-hidden="true">
              ✓
            </span>
            <div className="body">
              <span style={{ fontSize: 13.5, color: "var(--muted)" }}>{c}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="tiny num" style={{ marginTop: 20 }}>
        Verified and paid in 1.2 seconds
      </p>

      <div className="stack" style={{ gap: 10, marginTop: 30 }}>
        <Link href="/earnings" className="btn btn-amber">
          See your earnings
        </Link>
        <Link href="/tasks" className="btn btn-quiet">
          Take another campaign
        </Link>
      </div>
    </main>
  );
}
