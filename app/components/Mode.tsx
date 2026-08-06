"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * One account, two sides.
 *
 * The mode is derived from the route, not stored and read back. It used to default to
 * "earning" and load the real value from localStorage in an effect — so a business
 * opening its dashboard got one frame of the earning navigation before it flipped.
 * Every hard refresh showed the wrong side of the app first.
 *
 * Where you are *is* which side you are on: the dashboard and the post form are the
 * advertising side; browse, links and earnings are the earning side. That cannot lag
 * behind a render, cannot disagree with the page it is sitting on, and needs nothing
 * read from storage before it is correct.
 *
 * localStorage still remembers a preference, but only to answer one question: which
 * side to open when you arrive somewhere that belongs to neither.
 */

export type Mode = "earning" | "advertising";

const ADVERTISING_ROUTES = ["/business", "/post"];

/** Which side a route belongs to, or null when it belongs to neither. */
export function modeForPath(pathname: string): Mode | null {
  if (ADVERTISING_ROUTES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return "advertising";
  if (["/tasks", "/campaigns", "/earnings"].some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return "earning";
  }
  return null;
}

const Ctx = createContext<{ mode: Mode; setMode: (m: Mode) => void }>({
  mode: "earning",
  setMode: () => {},
});

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const routeMode = modeForPath(pathname);

  // Only consulted on routes that belong to neither side.
  const [preferred, setPreferred] = useState<Mode>("earning");

  useEffect(() => {
    const saved = localStorage.getItem("vane-mode");
    if (saved === "earning" || saved === "advertising") setPreferred(saved);
  }, []);

  // Remember the side they are actually using, so a neutral route opens the right one.
  useEffect(() => {
    if (routeMode) localStorage.setItem("vane-mode", routeMode);
  }, [routeMode]);

  const mode = routeMode ?? preferred;

  function setMode(m: Mode) {
    setPreferred(m);
    localStorage.setItem("vane-mode", m);
  }

  return <Ctx.Provider value={{ mode, setMode }}>{children}</Ctx.Provider>;
}

export function useMode() {
  return useContext(Ctx);
}
