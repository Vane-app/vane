"use client";

import { useEffect, useState } from "react";

/**
 * Who is already signed in.
 *
 * Vane is one account with two sides. Somebody who joined to earn and later wants to
 * advertise — or the reverse — is the same person, and should not be asked again for
 * their email, their name, their photo, or their PIN. The second side should feel like
 * unlocking something rather than starting over.
 *
 * `known` is the signal the onboarding flows branch on: when true, they skip identity
 * and ask only what is genuinely new about this side of the marketplace.
 */

export interface Me {
  id: string;
  email: string;
  role: "tasker" | "business" | "both";
  name: string;
  avatar: string;
  walletAddress: string;
  reputation: number;
}

export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        if (live) setMe(d.user ?? null);
      })
      .catch(() => {
        // Not being signed in is the normal case, not an error worth surfacing.
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  return { me, loading, known: Boolean(me) };
}

/** Whether this account has already been through the other side's onboarding. */
export function hasSide(me: Me | null, side: "tasker" | "business"): boolean {
  if (!me) return false;
  return me.role === "both" || me.role === side;
}
