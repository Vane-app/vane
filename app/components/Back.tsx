"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * The way out.
 *
 * Several screens were dead ends — sign-up, log-in, the role chooser and the
 * multi-step onboarding all had no way back except the browser's own button, and
 * inside onboarding not even that, since the steps are component state rather than
 * routes. Any screen that can be entered has to be leavable.
 *
 * `href` for a known destination; `onClick` to step backwards within a flow; neither,
 * and it falls back to browser history.
 */
export function Back({
  href,
  onClick,
  label = "Back",
}: {
  href?: string;
  onClick?: () => void;
  label?: string;
}) {
  const router = useRouter();

  if (href) {
    return (
      <Link href={href} className="backlink">
        ← {label}
      </Link>
    );
  }

  return (
    <button type="button" className="backlink" onClick={onClick ?? (() => router.back())}>
      ← {label}
    </button>
  );
}
