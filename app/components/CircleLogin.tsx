"use client";

import { useState } from "react";
import { loadCircleSdk, circleDeviceId } from "./Wallet";

/**
 * Sign in with Circle's email OTP.
 *
 * Vane could not send email. Delivering to an arbitrary address needs a domain proved
 * by DNS records, there was none, and the fallback of printing the code on screen is
 * the impersonation hole this app already closed once. So real addresses got an error
 * telling them to try again, which was never going to work, and the only way in was a
 * guest account most people never noticed.
 *
 * Circle sends it. The code is typed inside Circle's own modal — we never see it, the
 * same way we never see the PIN — and the login it produces is the one the wallet
 * needs anyway, so signing in and having a wallet stop being two separate errands.
 *
 * The result is checked on our server before any session exists. What comes back from
 * this component is a claim; `PUT /api/auth/circle` is what makes it a fact.
 */

interface Props {
  role?: "tasker" | "business";
  /** Saved once the sign-in is verified — the business form collects these first. */
  profile?: { name?: string; avatar?: string };
  submitLabel?: string;
  onVerified: (user: { id: string; email: string; role: string }, isNew: boolean) => void;
}

export function CircleLogin({ role, profile, submitLabel = "Continue", onVerified }: Props) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const valid = /.+@.+\..+/.test(email);

  /**
   * A way in for someone who will not hand over an inbox.
   *
   * Kept after moving to Circle because it costs nothing and it is the fallback if
   * Circle's mail is slow or its login is having a bad day — a demo with one door is a
   * demo that can be shut. Nothing can be delivered to demo.vane, which is exactly why
   * showing that code is safe: the only account reachable is the one just created by
   * whoever is looking at the screen.
   */
  async function guest() {
    setBusy(true);
    setError(null);
    setNote("Making you an account…");
    try {
      const address = `guest-${Math.random().toString(36).slice(2, 8)}@demo.vane`;
      const asked = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address }),
      });
      const sent = await asked.json();
      if (!asked.ok || !sent.devCode) throw new Error(sent.error ?? "Could not start a guest account.");

      const done = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address, code: sent.devCode, role }),
      });
      const out = await done.json();
      if (!done.ok || !out.user) throw new Error(out.error ?? "Could not start a guest account.");
      onVerified(out.user, out.isNew);
    } catch (err) {
      setError((err as Error).message);
      setNote(null);
    } finally {
      setBusy(false);
    }
  }

  async function signIn() {
    setBusy(true);
    setError(null);
    setNote("Getting things ready…");

    try {
      const { appId, configured } = await (await fetch("/api/auth/circle")).json();
      if (!configured || !appId) throw new Error("Sign-in is not configured on this deployment.");

      // Circle binds the login token to this browser, so the device id has to exist
      // before we ask for a code.
      const deviceId = await circleDeviceId(appId);

      setNote("Sending your code…");
      const res = await fetch("/api/auth/circle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, deviceId }),
      });
      const started = await res.json();
      if (!res.ok) throw new Error(started.error ?? "Could not send a code.");

      const sdk = await loadCircleSdk(appId);

      setNote("Check your email — the code goes in Circle's window.");

      // The modal hands its result to this callback rather than returning it, so the
      // promise is what lets the rest of sign-in read as a sequence.
      const result = await new Promise<{ userToken: string; encryptionKey: string }>(
        (resolve, reject) => {
          sdk.updateConfigs(
            {
              appSettings: { appId },
              loginConfigs: {
                deviceToken: started.deviceToken,
                deviceEncryptionKey: started.deviceEncryptionKey,
              },
            },
            (err, res) => {
              if (err) return reject(new Error(err.message || "Sign-in was cancelled."));
              if (!res?.userToken) return reject(new Error("Sign-in did not complete."));
              resolve({ userToken: res.userToken, encryptionKey: res.encryptionKey });
            },
          );
          sdk.verifyOtp();
        },
      );

      setNote("Signing you in…");
      const done = await fetch("/api/auth/circle", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...result, email, role }),
      });
      const out = await done.json();
      if (!done.ok || !out.user) throw new Error(out.error ?? "Could not complete sign-in.");

      // The session exists now, so the profile the form already collected can be saved
      // against it. Failing here must not block a sign-in that has otherwise succeeded.
      if (profile?.name || profile?.avatar) {
        await fetch("/api/auth", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profile),
        }).catch(() => {});
      }

      onVerified(out.user, out.isNew);
    } catch (err) {
      setError((err as Error).message);
      setNote(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !busy) void signIn();
      }}
    >
      <div className="card" style={{ marginBottom: 12 }}>
        <label htmlFor="email" className="eyebrow">
          Your email
        </label>
        <input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="ob-input"
        />
      </div>

      <button
        type="submit"
        className="btn btn-amber"
        disabled={!valid || busy}
        style={{ opacity: valid && !busy ? 1 : 0.4 }}
      >
        {busy ? (note ?? "Working…") : submitLabel}
      </button>

      {note && !busy && <p className="tiny" style={{ marginTop: 10 }}>{note}</p>}
      {error && <p className="wallet-error" style={{ marginTop: 10 }}>{error}</p>}

      <p className="tiny" style={{ marginTop: 14 }}>
        Circle sends the code and checks it in their own window — Vane never sees it.
      </p>

      <button
        type="button"
        className="tiny"
        disabled={busy}
        onClick={() => void guest()}
        style={{
          marginTop: 12,
          background: "none",
          border: 0,
          padding: 0,
          cursor: busy ? "default" : "pointer",
          textDecoration: "underline",
          textUnderlineOffset: 3,
        }}
      >
        Or look around with a guest account
      </button>
    </form>
  );
}
