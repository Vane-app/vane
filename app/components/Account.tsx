"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMe } from "./Me";

/**
 * Signing out, and the wallet.
 *
 * These were one component that repeated the whole account — avatar, name, email and
 * a sign-out button — on the dashboard, while the rail showed exactly the same thing
 * a few hundred pixels to the left. Two identical blocks on one screen, two sign-out
 * buttons, and on an empty dashboard the duplicate was the largest thing on the page.
 *
 * Identity lives in the rail, which is where people look for it and where it stays
 * visible on every screen. What belongs on a dashboard is the part that changes and
 * that you act on: the wallet the money moves through, what is in it, and the standing
 * that decides how fast payouts clear.
 */

export function SignOut({ className = "acct-signout tiny" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function out() {
    setBusy(true);
    try {
      await fetch("/api/auth", { method: "DELETE" });
    } finally {
      // Clear the remembered side, so the next person to sign in on this browser does
      // not land in the previous user's half of the marketplace.
      try {
        localStorage.removeItem("vane-mode");
        sessionStorage.clear();
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

/**
 * The wallet, and what is in it.
 *
 * Balance matters more than it looks: gas on Arc is USDC, and a business cannot fund a
 * campaign it cannot pay for. Showing it here is the difference between finding that
 * out now and finding out halfway through posting.
 */
export function WalletStrip({ reputation }: { reputation?: number }) {
  const { me } = useMe();
  const rep = reputation ?? me?.reputation ?? 80;
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!me?.walletAddress) return;
    let live = true;
    fetch(`/api/wallet/balance`)
      .then((r) => r.json())
      .then((d) => live && typeof d.usdc === "number" && setBalance(d.usdc))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [me?.walletAddress]);

  if (!me) return null;

  if (!me.walletAddress) {
    return (
      <section className="walletstrip">
        <div>
          <span className="eyebrow">Your wallet</span>
          <p className="tiny" style={{ marginTop: 6 }}>
            Not set up yet. You&rsquo;ll create one the first time you fund a campaign or take one.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="walletstrip">
      <div className="walletstrip-main">
        <span className="eyebrow">Your wallet</span>
        <code className="wallet-addr">{me.walletAddress}</code>
        <div className="row" style={{ justifyContent: "space-between", marginTop: 8, gap: 10 }}>
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

      <div className="walletstrip-figs">
        <div>
          <b className="num">{balance === null ? "—" : `$${balance.toFixed(2)}`}</b>
          <span>USDC available</span>
        </div>
        <div>
          <b className="num">{rep}</b>
          <span>reputation</span>
        </div>
      </div>
    </section>
  );
}
