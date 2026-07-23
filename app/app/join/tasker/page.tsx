"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Falcon, Mark } from "../../../components/Falcon";
import { useProfile, type Channel } from "../../../components/Profile";
import { Upload } from "../../../components/Upload";
import { OnboardFrame } from "../../../components/Onboard";
import { INDUSTRIES, type Industry } from "../../../lib/data";

/**
 * Tasker onboarding — progressive, one question per step, the way the best
 * fintech apps do it. Email, then strengths and channels that power
 * recommendations, an optional social connection, and a wallet created silently.
 * The falcon carries it, so it feels guided rather than administrative.
 */

const CHANNELS: { id: Channel; label: string }[] = [
  { id: "X", label: "X / Twitter" },
  { id: "Newsletter", label: "Newsletter" },
  { id: "YouTube", label: "YouTube" },
  { id: "Community", label: "Community / Discord" },
  { id: "Personal", label: "Personal network" },
];

type Step = "email" | "profile" | "strengths" | "channels" | "socials" | "done";

const ORDER: Step[] = ["email", "profile", "strengths", "channels", "socials", "done"];

export default function TaskerOnboarding() {
  const router = useRouter();
  const { save } = useProfile();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [strengths, setStrengths] = useState<Industry[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [socials, setSocials] = useState<string[]>([]);

  const idx = ORDER.indexOf(step);
  const emailValid = /.+@.+\..+/.test(email);

  function next() {
    const n = ORDER[idx + 1];
    if (n === "done") {
      save({ onboarded: true, email, name, avatar, strengths, channels, socials });
    }
    setStep(n);
  }

  function toggle<T>(arr: T[], v: T, set: (a: T[]) => void) {
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  }

  return (
    <OnboardFrame side="earning">
      <header className="ob-top">
        <span className="row" style={{ gap: 9 }}>
          <Mark size={20} color="var(--amber)" />
          <b style={{ fontSize: 19, letterSpacing: "-.04em" }}>vane</b>
        </span>
        {step !== "done" && (
          <div className="ob-progress" aria-hidden="true">
            {ORDER.slice(0, -1).map((s, i) => (
              <i key={s} className={i <= idx ? "on" : ""} />
            ))}
          </div>
        )}
      </header>

      {step === "email" && (
        <Panel
          title="Let's get you earning"
          sub="Just your email to start. Your payout account is created for you — no wallet, no card, no seed phrase."
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (emailValid) next();
            }}
          >
            <div className="card" style={{ marginBottom: 14 }}>
              <label htmlFor="email" className="eyebrow">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                className="ob-input"
              />
            </div>
            <button type="submit" className="btn btn-amber" disabled={!emailValid} style={{ opacity: emailValid ? 1 : 0.4 }}>
              Continue
            </button>
          </form>
        </Panel>
      )}

      {step === "profile" && (
        <Panel title="Add a face to your name" sub="Businesses see who's promoting them. A photo and a name build trust — and both are optional.">
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}>
            <Upload shape="avatar" value={avatar} onChange={setAvatar} label="Add photo" />
          </div>
          <div className="card" style={{ marginBottom: 14 }}>
            <label htmlFor="name" className="eyebrow">
              Name or handle
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tunde, or @tunde"
              autoFocus
              className="ob-input"
            />
          </div>
          <button className="btn btn-amber" onClick={next}>
            {name || avatar ? "Continue" : "Skip for now"}
          </button>
        </Panel>
      )}

      {step === "strengths" && (
        <Panel
          title="What are you strongest in?"
          sub="Pick a few. We'll surface campaigns that fit your audience first — and alert you when a new one lands."
        >
          <div className="ob-chips">
            {INDUSTRIES.map((ind) => (
              <button
                key={ind}
                className={`ob-chip ${strengths.includes(ind) ? "on" : ""}`}
                onClick={() => toggle(strengths, ind, setStrengths)}
              >
                {ind}
              </button>
            ))}
          </div>
          <button className="btn btn-amber" onClick={next} disabled={!strengths.length} style={{ opacity: strengths.length ? 1 : 0.4, marginTop: 22 }}>
            {strengths.length ? `Continue with ${strengths.length}` : "Pick at least one"}
          </button>
        </Panel>
      )}

      {step === "channels" && (
        <Panel title="Where's your audience?" sub="So we know how you'll promote. You can change this anytime.">
          <div className="ob-chips">
            {CHANNELS.map((c) => (
              <button
                key={c.id}
                className={`ob-chip ${channels.includes(c.id) ? "on" : ""}`}
                onClick={() => toggle(channels, c.id, setChannels)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <button className="btn btn-amber" onClick={next} disabled={!channels.length} style={{ opacity: channels.length ? 1 : 0.4, marginTop: 22 }}>
            Continue
          </button>
        </Panel>
      )}

      {step === "socials" && (
        <Panel
          title="Connect a channel?"
          sub="Optional. Only needed later if you take a content campaign that verifies posts. Referral and onchain campaigns never need it."
        >
          <div className="stack" style={{ gap: 10 }}>
            {["X / Twitter", "YouTube"].map((s) => (
              <button
                key={s}
                className={`ob-social ${socials.includes(s) ? "on" : ""}`}
                onClick={() => toggle(socials, s, setSocials)}
              >
                <span>{s}</span>
                <b>{socials.includes(s) ? "Connected ✓" : "Connect"}</b>
              </button>
            ))}
          </div>
          <button className="btn btn-amber" onClick={next} style={{ marginTop: 22 }}>
            {socials.length ? "Continue" : "Skip for now"}
          </button>
        </Panel>
      )}

      {step === "done" && (
        <div className="ob-done">
          {avatar ? (
            <span className="face-ring" style={{ padding: 3 }}>
              <img className="face" src={avatar} alt="" width={96} height={96} />
            </span>
          ) : (
            <Falcon mode="idle" size={140} />
          )}
          <h1 style={{ fontSize: 30, lineHeight: 1.08, marginTop: 8 }}>You&rsquo;re in</h1>
          <p className="sub" style={{ fontSize: 15, marginTop: 10, maxWidth: "32ch", marginInline: "auto" }}>
            Your payout account is ready. We&rsquo;ve lined up {strengths.length ? strengths[0] : "fintech"} campaigns
            that fit you.
          </p>
          <button className="btn btn-amber" style={{ marginTop: 28, maxWidth: 360 }} onClick={() => router.push("/tasks")}>
            See your recommended campaigns
          </button>
        </div>
      )}
    </OnboardFrame>
  );
}

function Panel({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="ob-panel fade-up">
      <h1 style={{ fontSize: 28, lineHeight: 1.1 }}>{title}</h1>
      <p className="sub" style={{ fontSize: 14.5, marginTop: 10, marginBottom: 24 }}>
        {sub}
      </p>
      {children}
    </div>
  );
}
