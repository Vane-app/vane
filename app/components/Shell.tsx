"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mark } from "./Falcon";

/**
 * App chrome.
 *
 * The marketing page at "/" owns the whole window and never renders this.
 * Everything else is the product: full-bleed on a phone, and on a desktop the
 * app in a true-proportioned device with a way to move between screens. No pitch
 * here — the argument was made on the landing page.
 */

const FLOWS = [
  { href: "/start", label: "Open" },
  { href: "/join/business", label: "Post a campaign" },
  { href: "/tasks", label: "Browse tasks" },
  { href: "/business", label: "Watch it settle" },
  { href: "/earnings", label: "Earnings" },
  { href: "/paid", label: "Get paid" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // The homepage and the screenshot preview own the whole window — neither is
  // the app, and neither sits inside the app's frame.
  if (pathname === "/" || pathname === "/preview") return <>{children}</>;

  return (
    <div className="stage">
      <div className="sky" aria-hidden="true">
        <svg viewBox="0 0 1400 900" preserveAspectRatio="xMidYMid slice">
          <path d="M-40 190 C 300 140, 560 250, 900 190 C 1130 148, 1300 172, 1440 132" fill="none" stroke="#f0a94b" strokeWidth="1.6" opacity="0.1" />
          <path d="M-40 320 C 320 270, 620 386, 960 320 C 1180 278, 1320 302, 1440 270" fill="none" stroke="#f0a94b" strokeWidth="1.3" opacity="0.07" />
          <path d="M-40 520 C 300 470, 610 580, 950 518 C 1170 480, 1320 502, 1440 470" fill="none" stroke="#7fa8b8" strokeWidth="1.2" opacity="0.06" />
        </svg>
      </div>

      <header className="topbar">
        <Link href="/" className="row" style={{ gap: 11 }}>
          <span className="logo-tile">
            <Mark size={22} color="var(--amber)" />
          </span>
          <b style={{ fontSize: 21, letterSpacing: "-.035em" }}>Vane</b>
          <span className="tag">Arc testnet</span>
        </Link>
        <span className="topbar-note">Arc testnet · settled in USDC</span>
      </header>

      <div className="devicewrap">
        <div className="device">
          <div className="device-status" aria-hidden="true">
            <span className="num">9:41</span>
            <span className="row" style={{ gap: 5 }}>
              <svg viewBox="0 0 18 12" width="17" height="11">
                <rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor" />
                <rect x="4.5" y="5.5" width="3" height="6.5" rx="1" fill="currentColor" />
                <rect x="9" y="3" width="3" height="9" rx="1" fill="currentColor" />
                <rect x="13.5" y="0" width="3" height="12" rx="1" fill="currentColor" opacity="0.4" />
              </svg>
              <svg viewBox="0 0 26 12" width="24" height="11">
                <rect x="0.5" y="0.5" width="21" height="11" rx="3.5" fill="none" stroke="currentColor" opacity="0.5" />
                <rect x="2.5" y="2.5" width="14" height="7" rx="1.8" fill="currentColor" />
                <path d="M23.5 4.2 v3.6 a2.4 2.4 0 0 0 0-3.6z" fill="currentColor" opacity="0.5" />
              </svg>
            </span>
          </div>
          <div className="device-screen">{children}</div>
        </div>

        <nav className="flows" aria-label="Jump to a screen">
          {FLOWS.map((f) => (
            <Link key={f.href} href={f.href} className={`flow ${pathname === f.href ? "flow-on" : ""}`}>
              {f.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
