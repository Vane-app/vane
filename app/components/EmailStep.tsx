"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Email, then a code. The only way into an account.
 *
 * One component for both front doors and the login screen, so proving you own an
 * address works identically everywhere — and so there is exactly one place where that
 * logic can be got wrong.
 *
 * `role` is passed through on verification, which is what makes signing up and signing
 * in the same flow: the code proves the address, the role says which side you asked for.
 */

interface Props {
  role?: "tasker" | "business";
  /** Extra fields to save alongside the account once the code checks out. */
  profile?: { name?: string; avatar?: string };
  submitLabel?: string;
  onVerified: (user: { id: string; email: string; role: string }, isNew: boolean) => void;
}

export function EmailStep({ role, profile, submitLabel = "Continue", onVerified }: Props) {
  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  const emailValid = /.+@.+\..+/.test(email);

  // A visible countdown, because "expires in ten minutes" is only useful if you can
  // see it running down.
  useEffect(() => {
    if (stage !== "code" || secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [stage, secondsLeft]);

  useEffect(() => {
    if (stage === "code") codeRef.current?.focus();
  }, [stage]);

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not send a code.");
      setReturning(Boolean(data.returning));
      setDevCode(data.devCode ?? null);
      setSecondsLeft(Number(data.expiresInSeconds ?? 600));
      setStage("code");
      setCode("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, role, ...profile }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't work.");
      onVerified(data.user, Boolean(data.isNew));
    } catch (err) {
      setError((err as Error).message);
      setCode("");
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  if (stage === "email") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (emailValid && !busy) void sendCode();
        }}
      >
        <div className="card" style={{ marginBottom: 14 }}>
          <label htmlFor="email" className="eyebrow">
            Email
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoFocus
            className="ob-input"
          />
        </div>
        <button
          type="submit"
          className="btn btn-amber"
          disabled={!emailValid || busy}
          style={{ opacity: emailValid && !busy ? 1 : 0.4 }}
        >
          {busy ? "Sending a code…" : submitLabel}
        </button>
        {error && <p className="wallet-error" style={{ marginTop: 10 }}>{error}</p>}
      </form>
    );
  }

  const mins = Math.floor(secondsLeft / 60);
  const secs = String(secondsLeft % 60).padStart(2, "0");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === 6 && !busy) void submitCode();
      }}
    >
      <p className="sub" style={{ fontSize: 14, marginBottom: 16 }}>
        {returning ? "Welcome back. " : ""}We sent a 6-digit code to{" "}
        <b style={{ color: "var(--ink)" }}>{email}</b>.
      </p>

      <div className="card" style={{ marginBottom: 12 }}>
        <label htmlFor="code" className="eyebrow">
          Your code
        </label>
        <input
          id="code"
          ref={codeRef}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          className="ob-input code-input"
        />
      </div>

      {/* Shown only when no email provider is configured, so the flow is completable
          on a fresh checkout instead of dead-ending on an account nobody has made. */}
      {devCode && (
        <p className="tiny" style={{ marginBottom: 12 }}>
          Email isn&rsquo;t configured on this deployment, so here it is:{" "}
          <b className="num" style={{ color: "var(--amber)" }}>{devCode}</b>
        </p>
      )}

      <button
        type="submit"
        className="btn btn-amber"
        disabled={code.length !== 6 || busy}
        style={{ opacity: code.length === 6 && !busy ? 1 : 0.4 }}
      >
        {busy ? "Checking…" : "Verify and continue"}
      </button>

      {error && <p className="wallet-error" style={{ marginTop: 10 }}>{error}</p>}

      <div className="row" style={{ justifyContent: "space-between", marginTop: 14, gap: 10 }}>
        <button
          type="button"
          className="tiny"
          onClick={() => {
            setStage("email");
            setError(null);
          }}
          style={{ background: "none", border: 0, cursor: "pointer", color: "var(--muted)" }}
        >
          ← Use a different email
        </button>
        <button
          type="button"
          className="tiny"
          onClick={() => void sendCode()}
          disabled={busy}
          style={{ background: "none", border: 0, cursor: "pointer", color: "var(--amber)", fontWeight: 700 }}
        >
          {secondsLeft > 0 ? `Resend (expires ${mins}:${secs})` : "Send a new code"}
        </button>
      </div>
    </form>
  );
}
