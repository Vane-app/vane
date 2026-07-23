"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Mark } from "./Falcon";
import { useMode, type Mode } from "./Mode";

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
    { href: "/earnings", label: "Earnings", icon: ICONS.earnings },
    { href: "/account", label: "Account", icon: ICONS.account },
  ],
  advertising: [
    { href: "/business", label: "Dashboard", icon: ICONS.dashboard },
    { href: "/post", label: "Post", icon: ICONS.post },
    { href: "/account", label: "Account", icon: ICONS.account },
  ],
};

/** The primary landing page for each mode, used when the toggle is switched. */
const HOME: Record<Mode, string> = { earning: "/tasks", advertising: "/business" };

/** Full-window routes with no app chrome: marketing, onboarding, the preview. */
const BARE = ["/", "/preview", "/start", "/join/tasker", "/join/business"];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { mode, setMode } = useMode();

  if (BARE.includes(pathname)) return <>{children}</>;

  const nav = NAV[mode];

  function switchMode(m: Mode) {
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
