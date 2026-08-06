"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMe } from "./Me";

/**
 * The "you" panel, and a sign-out that actually signs you out.
 *
 * Earnings and Account were two screens showing overlapping halves of the same
 * thing — a balance on one, the wallet it lands in on the other. They are one
 * dashboard now, and this is the part that belongs to the person rather than the
 * money: their wallet, their standing, and the way out.
 *
 * The old sign-out was `<Link href="/">`. It navigated home and left the session
 * cookie in place, so you were still logged in — a button that looked like it did
 * something and didn't.
 */

export function SignOut({ className = "acct-signout tiny" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function out() {
    setBusy(true);
    try {
      await fetch("/api/auth", { method: "DELETE" });
    } finally {
      // Clear the client-side mode so the next person to sign in on this browser
      // doesn't land in the previous user's side of the marketplace.
      try {
        localStorage.removeItem("vane-mode");
      } catch {}
      router.push("/");
      router.refresh();
    }
  }

  return (
    <button type="button" className={className} onClick={() => void out()} disabled={busy}>
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}

/** Wallet, standing and sign-out — shown on whichever dashboard you're on. */
export function AccountPanel({ reputation }: { reputation?: number }) {
  const { me } = useMe();
  const rep = reputation ?? me?.reputation ?? 80;

  return (
    <section className="acctpanel fade-up">
      <div className="acctpanel-head">
        <div className="row" style={{ gap: 11, minWidth: 0 }}>
          {me?.avatar ? (
            <span className="face-ring" style={{ padding: 2 }}>
              <img className="face" src={me.avatar} alt="" width={40} height={40} />
            </span>
          ) : (
            <span className="avatar" style={{ width: 40, height: 40, fontSize: 15 }} aria-hidden="true">
              {(me?.name || me?.email || "V").slice(0, 1).toUpperCase()}
            </span>
          )}
          <div style={{ minWidth: 0 }}>
            <b style={{ display: "block", fontSize: 15 }}>{me?.name || "Your account"}</b>
            <span className="tiny">{me?.email ?? ""}</span>
          </div>
        </div>
        <SignOut className="btn-quiet tiny acctpanel-out" />
      </div>

      {me?.walletAddress ? (
        <div className="acctpanel-wallet">
          <span className="eyebrow">Your wallet</span>
          <code className="wallet-addr">{me.walletAddress}</code>
          <div className="row" style={{ justifyContent: "space-between", marginTop: 9, gap: 10 }}>
            <span className="tiny">Only you can move what&rsquo;s in it.</span>
            <a
              className="tiny"
              href={`https://testnet.arcscan.app/address/${me.walletAddress}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--amber)", fontWeight: 700, whiteSpace: "nowrap" }}
            >
              Arcscan →
            </a>
          </div>
        </div>
      ) : (
        <div className="acctpanel-wallet">
          <span className="eyebrow">Your wallet</span>
          <p className="tiny" style={{ marginTop: 6 }}>
            Not set up yet — you&rsquo;ll create one the first time you take a campaign.
          </p>
        </div>
      )}

      <div className="acctpanel-rep">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <span className="eyebrow" style={{ margin: 0 }}>
            Reputation
          </span>
          <b className="num" style={{ color: "var(--amber)" }}>
            {rep}
          </b>
        </div>
        <div className="rep-bar">
          <i style={{ width: `${rep}%` }} />
        </div>
        <p className="tiny" style={{ marginTop: 8 }}>
          Rises with every verified result. Higher reputation clears your payouts faster.
        </p>
      </div>
    </section>
  );
}
