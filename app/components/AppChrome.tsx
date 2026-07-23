"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mark } from "./Falcon";
import { useMode, type Mode } from "./Mode";
import { ModeToggle } from "./Shell";

/**
 * Mobile top bar. On a phone the nav rail is hidden, so this carries the brand,
 * the mode toggle, and the account avatar. On a laptop it is hidden entirely —
 * the rail does this job. The bottom tab bar lives in Shell, so pages no longer
 * render their own; TabBar is kept as a no-op so existing pages don't break.
 */

export function AppBar({ avatar = "https://randomuser.me/api/portraits/men/32.jpg" }: { avatar?: string }) {
  const router = useRouter();
  const { mode, setMode } = useMode();

  function switchMode(m: Mode) {
    setMode(m);
    router.push(m === "earning" ? "/tasks" : "/business");
  }

  return (
    <div className="appbar">
      <Link href="/" className="row" style={{ gap: 9 }} aria-label="Vane">
        <Mark size={20} color="var(--amber)" />
        <b style={{ fontSize: 19, letterSpacing: "-.04em" }}>vane</b>
      </Link>

      <div className="row" style={{ gap: 10 }}>
        <ModeToggle mode={mode} onSwitch={switchMode} />
        <Link href="/account" className="face-ring" aria-label="Your account">
          <img className="face" src={avatar} alt="" width={34} height={34} />
        </Link>
      </div>
    </div>
  );
}

/** The bottom tab bar now lives in Shell. Kept as a no-op for pages that call it. */
export function TabBar() {
  return null;
}
