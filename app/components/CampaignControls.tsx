"use client";

import { useState } from "react";
import { useWallet } from "./Wallet";

/**
 * Operating a campaign you posted.
 *
 * A business could post a campaign and then never touch it again. These are the
 * controls the escrow actually supports, and each says plainly what it does to the
 * money — an advertiser deciding whether to stop something needs to know whether their
 * budget is coming back, staying locked, or already spent.
 */

export function CampaignControls({
  campaignId,
  status,
  onChanged,
}: {
  campaignId: number;
  status: string;
  onChanged: () => void;
}) {
  const { approve } = useWallet();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const closed = status === "ended" || status === "cancelled" || status === "expired";

  async function run(action: string) {
    setBusy(action);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That didn't work.");

      // Ending is the business's own transaction: it moves their money, so they sign.
      if (data.needsApproval) {
        await approve({ ...data.auth, challengeId: data.challengeId });
        await fetch(`/api/campaigns/${campaignId}/control`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "ended-confirmed" }),
        });
        setNote("Ended on Arc. Unspent budget returns to you once the settlement window closes.");
      } else if (data.note) {
        setNote(data.note);
      }
      setConfirmEnd(false);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (closed) {
    return (
      <p className="tiny" style={{ color: "var(--faint)" }}>
        This campaign is closed. Unspent budget returns to you automatically.
      </p>
    );
  }

  return (
    <div className="campctl">
      <div className="campctl-row">
        {status === "paused" ? (
          <button className="campctl-btn" onClick={() => void run("resume")} disabled={busy !== null}>
            {busy === "resume" ? "Resuming…" : "Resume"}
          </button>
        ) : (
          <button className="campctl-btn" onClick={() => void run("pause")} disabled={busy !== null}>
            {busy === "pause" ? "Pausing…" : "Pause"}
          </button>
        )}

        {!confirmEnd ? (
          <button className="campctl-btn campctl-danger" onClick={() => setConfirmEnd(true)} disabled={busy !== null}>
            End campaign
          </button>
        ) : (
          <>
            <button
              className="campctl-btn campctl-danger"
              onClick={() => void run("end")}
              disabled={busy !== null}
            >
              {busy === "end" ? "Confirm in your wallet…" : "Yes, end it"}
            </button>
            <button className="campctl-btn" onClick={() => setConfirmEnd(false)} disabled={busy !== null}>
              Keep it running
            </button>
          </>
        )}
      </div>

      {confirmEnd && !busy && (
        <p className="tiny" style={{ marginTop: 8 }}>
          Ending stops new work. Results already earned are still paid, and whatever is left returns to you.
        </p>
      )}
      {note && <p className="tiny" style={{ marginTop: 8, color: "var(--verified)" }}>{note}</p>}
      {error && <p className="wallet-error" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
