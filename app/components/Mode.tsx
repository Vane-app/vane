"use client";

import { createContext, useContext, useEffect, useState } from "react";

/**
 * One account, two modes.
 *
 * A person signs up once and can act as either side of the marketplace. The mode
 * decides which navigation they see — earning (browse, earnings) or advertising
 * (dashboard, post) — and persists across navigation so switching sticks.
 */

export type Mode = "earning" | "advertising";

const Ctx = createContext<{ mode: Mode; setMode: (m: Mode) => void }>({
  mode: "earning",
  setMode: () => {},
});

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<Mode>("earning");

  useEffect(() => {
    const saved = localStorage.getItem("vane-mode");
    if (saved === "earning" || saved === "advertising") setModeState(saved);
  }, []);

  function setMode(m: Mode) {
    setModeState(m);
    localStorage.setItem("vane-mode", m);
  }

  return <Ctx.Provider value={{ mode, setMode }}>{children}</Ctx.Provider>;
}

export function useMode() {
  return useContext(Ctx);
}
