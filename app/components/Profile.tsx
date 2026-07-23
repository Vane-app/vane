"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Industry } from "../lib/data";

/**
 * What a tasker told us about themselves during onboarding.
 *
 * Their strengths (industries) and channels drive recommendations in Browse and,
 * later, alerts when a matching campaign is posted. Persisted so the marketplace
 * greets a returning user with work that fits.
 */

export type Channel = "X" | "Newsletter" | "YouTube" | "Community" | "Personal";

export interface Profile {
  onboarded: boolean;
  email: string;
  name: string;
  /** Data URL of the uploaded profile photo, or "" for the default. */
  avatar: string;
  strengths: Industry[];
  channels: Channel[];
  socials: string[]; // connected platform names
}

const EMPTY: Profile = { onboarded: false, email: "", name: "", avatar: "", strengths: [], channels: [], socials: [] };

const Ctx = createContext<{ profile: Profile; save: (p: Partial<Profile>) => void }>({
  profile: EMPTY,
  save: () => {},
});

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile>(EMPTY);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("vane-profile");
      if (raw) setProfile({ ...EMPTY, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);

  function save(p: Partial<Profile>) {
    setProfile((prev) => {
      const next = { ...prev, ...p };
      localStorage.setItem("vane-profile", JSON.stringify(next));
      return next;
    });
  }

  return <Ctx.Provider value={{ profile, save }}>{children}</Ctx.Provider>;
}

export function useProfile() {
  return useContext(Ctx);
}
