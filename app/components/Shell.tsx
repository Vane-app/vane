"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Mark } from "./Falcon";
import { useMode, type Mode } from "./Mode";
import { useMe, hasSide } from "./Me";
import { SignOut } from "./Account";

/**
 * App chrome — one account, two modes, two shapes.
 *
 * The navigation adapts to the current mode: earning (browse, earnings) or
 * advertising (dashboard, post). Account is shared. On a laptop it is a nav rail;
 * on a phone a bottom tab bar. This component owns all chrome — pages render only
 * their content plus a mobile top bar.
 */

const ICONS = {
  browse: <path d="M4 7h16M4 12h16M4 17h10" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />,
  earnings: (
    <path d="M4 17 10 10l4 3.5L20 6" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
  ),
  dashboard: <path d="M5 20V9M12 20V4M19 20v-7" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />,
  post: (
    <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  ),
  account: (
    <>
      <circle cx="12" cy="8.5" r="3.5" fill="none" stroke="currentColor" strokeWidth="2.1" />
      <path d="M5 20c1.4-3.4 3.9-5 7-5s5.6 1.6 7 5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    </>
  ),
};

const NAV: Record<Mode, { href: string; label: string; icon: React.ReactNode }[]> = {
  earning: [
    { href: "/tasks", label: "Browse", icon: ICONS.browse },
    { href: "/campaigns", label: "My campaigns", icon: ICONS.account },
    { href: "/earnings", label: "Earnings", icon: ICONS.earnings },
  ],
  advertising: [
    { href: "/business", label: "Dashboard", icon: ICONS.dashboard },
    { href: "/post", label: "Post", icon: ICONS.post },
  ],
};

/** The primary landing page for each mode, used when the toggle is switched. */
const HOME: Record<Mode, string> = { earning: "/tasks", advertising: "/business" };

/** Full-window routes with no app chrome: marketing, onboarding, the preview. */
const BARE = ["/", "/preview", "/start", "/login", "/join/tasker", "/join/business"];

/**
 * Who may see what.
 *
 * Every page rendered for anyone. The APIs returned 401 without a session, but the
 * screens themselves did not care — a stranger could open the business dashboard, the
 * post form or someone's earnings and get the whole app, empty but complete. Nothing
 * knew who was looking.
 *
 * A marketplace has to be browsable before you join, so discovery stays open: the
 * campaign feed, a campaign, a business's public profile. Everything that is *yours* —
 * your money, your links, your campaigns, the form that spends your budget — needs a
 * session, and the business side needs to actually be a business.
 */
const PUBLIC_PREFIXES = ["/tasks", "/campaign/", "/business/"];
const BUSINESS_ONLY = ["/business", "/post"];
/** Your links and your earnings only exist if you joined as a tasker. */
const TASKER_ONLY = ["/campaigns", "/earnings"];

function isPublic(pathname: string): boolean {
  if (pathname === "/business") return false; // the dashboard, not a public profile
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { mode, setMode } = useMode();
  const { me, loading } = useMe();

  /**
   * Send people where they belong, once we know who they are.
   *
   * Deliberately after the loading check: redirecting before /api/me answers would
   * bounce a signed-in person to the login screen on every hard refresh, which is
   * worse than the hole it closes.
   */
  useEffect(() => {
    if (loading || BARE.includes(pathname) || isPublic(pathname)) return;

    if (!me) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    const matches = (list: string[]) => list.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (matches(BUSINESS_ONLY) && !hasSide(me, "business")) {
      router.replace("/join/business");
      return;
    }
    if (matches(TASKER_ONLY) && !hasSide(me, "tasker")) {
      router.replace("/join/tasker");
    }
  }, [loading, me, pathname, router]);

  if (BARE.includes(pathname)) return <>{children}</>;

  /**
   * Show the chrome immediately, and only hold back the content.
   *
   * This used to swap out the entire frame while `/api/me` answered — rail, nav and
   * all — so every private page flashed a bare panel before the real app appeared.
   * The chrome does not depend on who you are; only the page inside it does.
   */
  const settling = !isPublic(pathname) && (loading || !me);

  const nav = NAV[mode];

  /**
   * Switching to advertising requires actually being an advertiser.
   *
   * Previously anyone who signed up to earn could flip the toggle and land on a
   * business dashboard full of campaigns and budgets that were not theirs. Someone who
   * has not onboarded as a business is sent to do that instead — the mode only changes
   * once there is something real behind it.
   */
  /**
   * Switching sides requires having that side.
   *
   * Advertising was gated and earning was not, so a business could flip to the earning
   * side and land on screens for an account that had never joined as a tasker: a
   * campaign feed it could not take from, links it did not have, earnings it could not
   * make. Whichever side you are missing, you are sent to join it — the same way, both
   * directions.
   */
  function switchMode(m: Mode) {
    const side = m === "advertising" ? "business" : "tasker";
    if (!hasSide(me, side)) {
      router.push(side === "business" ? "/join/business" : "/join/tasker");
      return;
    }
    setMode(m);
    router.push(HOME[m]);
  }

  return (
    <div className="app">
      <aside className="rail">
        <Link href="/" className="rail-brand">
          <Mark size={21} color="var(--amber)" />
          <b>vane</b>
        </Link>

        <ModeToggle mode={mode} onSwitch={switchMode} />

        <nav className="rail-nav" aria-label="Main">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={`rail-link ${pathname === n.href ? "on" : ""}`}>
              <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
                {n.icon}
              </svg>
              <span>{n.label}</span>
            </Link>
          ))}
        </nav>

        {/* Who you are, and the way out. Signing out previously meant navigating into
            a dashboard to find it — every other product puts it here, because this is
            where people look. */}
        {me && (
          <div className="rail-user">
            {me.avatar ? (
              <span className="face-ring" style={{ padding: 2 }}>
                <img className="face" src={me.avatar} alt="" width={32} height={32} />
              </span>
            ) : (
              <span className="avatar" style={{ width: 32, height: 32, fontSize: 13 }} aria-hidden="true">
                {(me.name || me.email || "V").slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="rail-user-id">
              <b>{me.name || me.email.split("@")[0]}</b>
              <i>{me.email}</i>
            </span>
            <SignOut className="rail-signout" />
          </div>
        )}

        <div className="rail-foot">
          <span className="livedot" aria-hidden="true" />
          <span>
            <b>Agent online</b>
            <i>Arc testnet · USDC</i>
          </span>
        </div>
      </aside>

      <main className="canvas">{children}</main>

      <nav className="tabbar-fixed" aria-label="Main">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className={`tab ${pathname === n.href ? "on" : ""}`} aria-label={n.label}>
            <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
              {n.icon}
            </svg>
            <span>{n.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function ModeToggle({ mode, onSwitch }: { mode: Mode; onSwitch: (m: Mode) => void }) {
  return (
    <div className="modetoggle" role="tablist" aria-label="Switch mode">
      <button className={mode === "earning" ? "on" : ""} onClick={() => onSwitch("earning")} role="tab" aria-selected={mode === "earning"}>
        Earning
      </button>
      <button
        className={mode === "advertising" ? "on" : ""}
        onClick={() => onSwitch("advertising")}
        role="tab"
        aria-selected={mode === "advertising"}
      >
        Advertising
      </button>
    </div>
  );
}
