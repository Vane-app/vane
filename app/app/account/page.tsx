"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMe, hasSide } from "../../components/Me";
import { useMode } from "../../components/Mode";

/**
 * Account has been folded into the dashboards.
 *
 * It duplicated Earnings: a balance on one screen, the wallet that balance lands in
 * on the other, the same campaign list on both. Two half-screens rather than one
 * whole one. Wallet, reputation and sign-out now live on whichever dashboard you are
 * already looking at, so there is nowhere else to go for them.
 *
 * Kept as a redirect because links to /account exist in the wild and a dead end is
 * worse than a redirect.
 */
export default function Account() {
  const router = useRouter();
  const { me, loading } = useMe();
  const { mode } = useMode();

  useEffect(() => {
    if (loading) return;
    if (!me) {
      router.replace("/login");
      return;
    }
    const advertising = mode === "advertising" && hasSide(me, "business");
    router.replace(advertising ? "/business" : "/earnings");
  }, [me, loading, mode, router]);

  return (
    <main className="screen">
      <p className="sub" style={{ marginTop: 40 }}>Taking you to your dashboard…</p>
    </main>
  );
}
