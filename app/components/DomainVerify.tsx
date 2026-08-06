"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Proving you control the brand you advertise.
 *
 * Presented as something a business wants rather than a hurdle it must clear: the
 * badge is what tells a promoter this is really who it says it is, and promoters
 * choose what to work on. Never blocking — an unverified business can still post,
 * and its listings simply say so.
 */

interface Instructions {
  domain: string;
  token: string;
  file: { path: string; url: string; contents: string };
  dns: { type: string; host: string; value: string };
}

export function DomainVerify({ compact = false }: { compact?: boolean }) {
  const [domain, setDomain] = useState("");
  const [claimed, setClaimed] = useState<string>("");
  const [verified, setVerified] = useState(false);
  const [instructions, setInstructions] = useState<Instructions | null>(null);
  const [method, setMethod] = useState<"file" | "dns">("file");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await fetch("/api/business/domain").then((r) => r.json());
      if (d.error) return;
      setClaimed(d.domain ?? "");
      setVerified(Boolean(d.verified));
      setInstructions(d.instructions ?? null);
      if (d.domain) setDomain(d.domain);
    } catch {
      // Not signed in yet, or offline. Nothing to show.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function claim() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/business/domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not save that domain.");
      setClaimed(d.domain);
      setVerified(false);
      setInstructions(d.instructions ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/business/domain", { method: "PUT" });
      const d = await res.json();
      if (d.verified) {
        setVerified(true);
        setInstructions(null);
        setNote(d.detail ?? "Verified.");
      } else {
        setNote(d.detail ?? "Not found yet.");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (verified) {
    return (
      <div className={compact ? "domver domver-compact" : "domver"}>
        <div className="row" style={{ gap: 9 }}>
          <span className="dot dot-ok" aria-hidden="true">
            ✓
          </span>
          <div style={{ minWidth: 0 }}>
            <b style={{ display: "block", fontSize: 14.5 }}>{claimed}</b>
            <span className="tiny">Verified — promoters can see this is really you.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={compact ? "domver domver-compact" : "domver"}>
      <div className="card" style={{ marginBottom: 12 }}>
        <label htmlFor="domain" className="eyebrow">
          Your website
        </label>
        <input
          id="domain"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="acme.com"
          className="ob-input"
        />
      </div>

      {!instructions && (
        <>
          <button
            className="btn btn-amber"
            onClick={() => void claim()}
            disabled={busy || domain.trim().length < 4}
            style={{ opacity: busy || domain.trim().length < 4 ? 0.4 : 1 }}
          >
            {busy ? "Saving…" : "Verify this domain"}
          </button>
          <p className="tiny" style={{ marginTop: 10 }}>
            Proving you control the domain is what stops anyone else posting campaigns in your name. Optional
            — you can post without it, and your listings will say so.
          </p>
        </>
      )}

      {instructions && (
        <>
          <p className="tiny" style={{ marginBottom: 10 }}>
            Prove you control <b style={{ color: "var(--ink)" }}>{instructions.domain}</b> — either way works.
          </p>

          <div className="domver-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={method === "file"}
              className={method === "file" ? "on" : ""}
              onClick={() => setMethod("file")}
            >
              Upload a file
            </button>
            <button
              role="tab"
              aria-selected={method === "dns"}
              className={method === "dns" ? "on" : ""}
              onClick={() => setMethod("dns")}
            >
              Add a DNS record
            </button>
          </div>

          {method === "file" ? (
            <div className="domver-how">
              <p className="tiny">
                Put a file at <code>{instructions.file.path}</code> containing this, then check:
              </p>
              <code className="wallet-addr">{instructions.file.contents}</code>
            </div>
          ) : (
            <div className="domver-how">
              <p className="tiny">Add this TXT record to your DNS, then check:</p>
              <code className="wallet-addr">{instructions.dns.value}</code>
              <p className="tiny" style={{ marginTop: 6 }}>
                DNS can take a few minutes to propagate.
              </p>
            </div>
          )}

          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button className="btn btn-amber" onClick={() => void check()} disabled={busy} style={{ flex: 1 }}>
              {busy ? "Checking…" : "Check now"}
            </button>
            <button
              className="campctl-btn"
              onClick={() => {
                void navigator.clipboard.writeText(
                  method === "file" ? instructions.file.contents : instructions.dns.value,
                );
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </>
      )}

      {note && <p className="tiny" style={{ marginTop: 10, color: "var(--amber)" }}>{note}</p>}
      {error && <p className="wallet-error" style={{ marginTop: 10 }}>{error}</p>}
    </div>
  );
}
