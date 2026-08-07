"use client";

import { useState } from "react";
import { INDUSTRIES, type Industry } from "../lib/data";

/**
 * What a promoter is good at, and where their audience is.
 *
 * Adding the earning side to an existing account is instant — the email, the wallet
 * and the account already exist, so asking for them again would be absurd. But the
 * useful half of joining went with it: nobody ever asked what this person promotes or
 * where, and Browse sorts by "best match" against exactly those strengths. So someone
 * who switched sides got a feed that could not personalise and no way to fix it.
 *
 * Asked once, on the earning side, and skippable. It changes what gets recommended,
 * not whether you can work — so it is a prompt, never a gate.
 */

const CHANNELS = ["X / Twitter", "Newsletter", "YouTube", "Community / Discord", "Personal network"];

export function PromoterProfile({ onDone }: { onDone: () => void }) {
  const [strengths, setStrengths] = useState<Industry[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  function toggle<T>(list: T[], v: T, set: (a: T[]) => void) {
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  }

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strengths, channels }),
      });
      // The route only ever accepted PUT, so this posted and got a 405 every time.
      // The catch below swallowed it, the panel closed, and Browse went on sorting by
      // "best match" against strengths that were never stored — a preference that
      // appeared to save and silently did not.
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      // Failing to save a preference must not block someone from working.
    } finally {
      setBusy(false);
      onDone();
    }
  }

  return (
    <section className="promoprofile fade-up">
      <div className="promoprofile-head">
        <div>
          <b style={{ display: "block", fontSize: 16 }}>What do you promote?</b>
          <span className="tiny">
            So the campaigns worth your time come first. You can change it whenever.
          </span>
        </div>
        <button className="tiny promoprofile-skip" onClick={onDone}>
          Skip
        </button>
      </div>

      <p className="eyebrow" style={{ margin: "16px 0 9px" }}>
        Strongest in
      </p>
      <div className="ob-chips">
        {INDUSTRIES.map((i) => (
          <button
            key={i}
            className={`ob-chip ${strengths.includes(i) ? "on" : ""}`}
            onClick={() => toggle(strengths, i, setStrengths)}
          >
            {i}
          </button>
        ))}
      </div>

      <p className="eyebrow" style={{ margin: "18px 0 9px" }}>
        Where your audience is
      </p>
      <div className="ob-chips">
        {CHANNELS.map((c) => (
          <button
            key={c}
            className={`ob-chip ${channels.includes(c) ? "on" : ""}`}
            onClick={() => toggle(channels, c, setChannels)}
          >
            {c}
          </button>
        ))}
      </div>

      <button
        className="btn btn-amber"
        style={{ marginTop: 18, maxWidth: 320 }}
        onClick={() => void save()}
        disabled={busy || strengths.length === 0}
      >
        {busy ? "Saving…" : strengths.length ? `Save and browse ${strengths[0]}` : "Pick at least one"}
      </button>
    </section>
  );
}
