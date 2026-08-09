"use client";

import { useCallback, useEffect, useState } from "react";

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
  strengths?: string[];
}

export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Re-read the account, after something changes it — adding a side, say.
   *
   * Only a clean answer is allowed to clear the account. This used to accept anything
   * it could parse, and `loading` is set false once at mount and never again — so a
   * single hiccup on the way back, a cold start or a blip mid-navigation, left `me`
   * null with nothing marking it as unknown. The Shell reads that as signed out and
   * replaces the page with the login screen.
   *
   * Switching between earning and advertising calls this, which is why that switch
   * threw people to login: nothing was wrong with their session, one request just
   * failed to answer in time.
   */
  const refresh = useCallback(async () => {
    const res = await fetch("/api/me").catch(() => null);
    if (!res || !res.ok) return;
    const d = await res.json().catch(() => null);
    if (d) setMe(d.user ?? null);
  }, []);

  useEffect(() => {
    let live = true;
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        if (live) setMe(d.user ?? null);
      })
      .catch(() => {
        // A failed request is not a signed-out user. Leaving `me` as it is keeps the
        // Shell from redirecting on the strength of a network error.
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  return { me, loading, refresh, known: Boolean(me) };
}

/** Whether this account has already been through the other side's onboarding. */
export function hasSide(me: Me | null, side: "tasker" | "business"): boolean {
  if (!me) return false;
  return me.role === "both" || me.role === side;
}
