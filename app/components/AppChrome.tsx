"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mark } from "./Falcon";

/** Top bar and bottom tab bar — the two pieces every in-app screen shares. */

export function AppBar({ avatar = "https://randomuser.me/api/portraits/women/21.jpg" }: { avatar?: string }) {
  return (
    <div className="appbar">
      <Link href="/" className="row" style={{ gap: 9 }} aria-label="Vane">
        <Mark size={20} color="var(--amber)" />
        <b style={{ fontSize: 19, letterSpacing: "-.04em" }}>vane</b>
      </Link>

      {/* Account lives in the tab bar, so the avatar here is identity, not a second
          route to the same place. Nothing in this bar duplicates a tab. */}
      <span className="face-ring">
        <img className="face" src={avatar} alt="Your account" width={34} height={34} />
      </span>
    </div>
  );
}

const TABS = [
  {
    href: "/business",
    label: "Campaigns",
    icon: (
      <path d="M5 20V9M12 20V4M19 20v-7" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    ),
  },
  {
    href: "/tasks",
    label: "Tasks",
    icon: (
      <path d="M4 7h16M4 12h16M4 17h10" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    ),
  },
  {
    href: "/earnings",
    label: "Earnings",
    icon: (
      <path
        d="M4 17 L10 10 L14 13.5 L20 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/start",
    label: "Account",
    icon: (
      <>
        <circle cx="12" cy="8.5" r="3.6" fill="none" stroke="currentColor" strokeWidth="2.1" />
        <path d="M4.8 20c1.4-3.6 4-5.4 7.2-5.4s5.8 1.8 7.2 5.4" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      </>
    ),
  },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={`tab ${pathname === t.href ? "on" : ""}`} aria-label={t.label}>
          <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
            {t.icon}
          </svg>
        </Link>
      ))}
    </nav>
  );
}
