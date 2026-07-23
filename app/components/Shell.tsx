"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mark } from "./Falcon";

/**
 * App chrome — one app, two shapes.
 *
 * On a phone: full-bleed content with a tab bar at the thumb.
 * On a laptop: a real desktop application — persistent nav rail on the left,
 * content using the width. No phone frame; a laptop app should look like one.
 *
 * The marketing homepage and the screenshot preview render outside this entirely.
 */

const NAV = [
  {
    href: "/tasks",
    label: "Browse",
    icon: <path d="M4 7h16M4 12h16M4 17h10" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />,
  },
  {
    href: "/earnings",
    label: "Earnings",
    icon: (
      <path
        d="M4 17 10 10l4 3.5L20 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/business",
    label: "Campaigns",
    icon: <path d="M5 20V9M12 20V4M19 20v-7" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />,
  },
  {
    href: "/start",
    label: "Account",
    icon: (
      <>
        <circle cx="12" cy="8.5" r="3.5" fill="none" stroke="currentColor" strokeWidth="2.1" />
        <path
          d="M5 20c1.4-3.4 3.9-5 7-5s5.6 1.6 7 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
      </>
    ),
  },
];

const BARE = ["/", "/preview"];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (BARE.includes(pathname)) return <>{children}</>;

  return (
    <div className="app">
      <aside className="rail">
        <Link href="/" className="rail-brand">
          <Mark size={21} color="var(--amber)" />
          <b>vane</b>
        </Link>

        <nav className="rail-nav" aria-label="Main">
          {NAV.map((n) => (
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
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`tab ${pathname === n.href ? "on" : ""}`} aria-label={n.label}>
            <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
              {n.icon}
            </svg>
          </Link>
        ))}
      </nav>
    </div>
  );
}
