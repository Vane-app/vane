"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Falcon, Mark } from "../../../components/Falcon";
import { useProfile, type Channel } from "../../../components/Profile";
import { Upload } from "../../../components/Upload";
import { OnboardFrame } from "../../../components/Onboard";
import { WalletStep } from "../../../components/Wallet";
import { Back } from "../../../components/Back";
import { useMe } from "../../../components/Me";
import { EmailStep } from "../../../components/EmailStep";
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
  const [walletReady, setWalletReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  /**
   * Already a business adding the earning side? Skip identity entirely.
   *
   * We have their email, their name and — the one that matters — their wallet. Asking
   * for a PIN again would be the single most annoying thing we could do to someone who
   * already has a wallet with us.
   */
  const { me } = useMe();
  useEffect(() => {
    if (!me) return;
    setEmail(me.email);
    setSignedIn(true);
    setName((n) => n || me.name);
    setAvatar((a) => a || me.avatar);

    /**
     * Skip identity only for an account that actually has one.
     *
     * This skipped whenever any session existed, and a session exists from the moment
     * a code is verified — deliberately, so a half-finished signup leaves a real
     * account to come back to. The two together meant anyone whose first attempt broke
     * partway could never reach the email step again: it rendered for a single frame,
     * the effect fired, and the screen jumped. It read as a flicker and a form that
     * refused to accept input, with no way back and nothing explaining why.
     *
     * A wallet, or the other side of the marketplace, is what makes skipping right —
     * that is someone who genuinely has an identity here already. Everyone else sees
     * the step, with their address filled in and a way to use a different one.
     */
    const established = Boolean(me.walletAddress) || me.role === "business" || me.role === "both";
    if (established) setStep((s) => (s === "email" ? "strengths" : s));
  }, [me]);

  const idx = ORDER.indexOf(step);
  const emailValid = /.+@.+\..+/.test(email);

  /**
   * Advance a step, creating the account as soon as we have an email.
   *
   * The session has to exist before the wallet step renders — that step talks to
   * Circle as this user, and without a session it fails with "Not signed in". Signing
   * in here rather than at the end also means a half-finished onboarding still leaves
   * a real account to come back to.
   */
  async function next() {
    const n = ORDER[idx + 1];

    if (n === "done") {
      save({ onboarded: true, email, name, avatar, strengths, channels, socials });
      // PATCH, not POST: the session already exists and POST now demands a code.
      void fetch("/api/auth", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, avatar }),
      });
    }
    setStep(n);
  }

  /** Step backwards, or leave the flow entirely from the first step. */
  function prev() {
    if (idx <= 0) {
      // Someone already signed in reached this by switching sides from inside the
      // app, so "back" means back to the app — not out to the signup chooser they
      // never came through.
      router.push(me ? "/business" : "/start");
      return;
    }
    setStep(ORDER[idx - 1]);
  }

  function toggle<T>(arr: T[], v: T, set: (a: T[]) => void) {
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  }

  return (
    <OnboardFrame side="earning" hero={step !== "done"} wide={step === "done"}>
      <header className="ob-top">
        {/* Three explicit slots: leave, identity, progress. They were previously three
            siblings in one flex row with a centring override, which jammed the back
            control against the wordmark and squashed the progress bar beside it. */}
        <div className="ob-top-left">
          {step !== "done" && <Back onClick={prev} label="Back" />}
        </div>

        <Link href="/" className="ob-top-brand" aria-label="Vane home">
          <Mark size={20} color="var(--amber)" />
          <b>vane</b>
        </Link>

        <div className="ob-top-right">
          {step !== "done" && (
            <div className="ob-progress" aria-hidden="true">
              {ORDER.slice(0, -1).map((s, i) => (
                <i key={s} className={i <= idx ? "on" : ""} />
              ))}
            </div>
          )}
        </div>
      </header>

      {step === "email" && (
        <Panel
          title="Let's get you earning"
          sub="Your email, then a 6-digit code to prove it's yours. No password to remember."
        >
          {/* Signed in already, but not set up — a signup that broke partway leaves
              exactly this state. Say whose account it is and offer both ways out,
              rather than looking like a form that will not accept an email. */}
          {me && (
            <div className="card" style={{ marginBottom: 14 }}>
              <p className="tiny" style={{ margin: 0 }}>
                You&rsquo;re signed in as <b style={{ color: "var(--ink)" }}>{me.email}</b>.
              </p>
              <div className="row" style={{ gap: 12, marginTop: 10 }}>
                <button className="btn btn-amber" style={{ flex: 1 }} onClick={() => setStep("profile")}>
                  Continue
                </button>
                <button
                  className="tiny"
                  onClick={async () => {
                    await fetch("/api/auth", { method: "DELETE" }).catch(() => {});
                    location.reload();
                  }}
                  style={{ background: "none", border: 0, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}
                >
                  Use a different email
                </button>
              </div>
            </div>
          )}

          <EmailStep
            role="tasker"
            submitLabel="Email me a code"
            onVerified={() => {
              setSignedIn(true);
              setStep("profile");
            }}
          />
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
          <div className="ob-done-portrait">
            {avatar ? (
              <span className="face-ring" style={{ padding: 3 }}>
                <img className="face" src={avatar} alt="" width={96} height={96} />
              </span>
            ) : (
              <Falcon mode="idle" size={140} />
            )}
          </div>

          <div className="ob-done-body">
            <h1 style={{ fontSize: 30, lineHeight: 1.08 }}>You&rsquo;re in</h1>
            <p className="sub" style={{ fontSize: 15, marginTop: 10 }}>
              One last thing: your payout wallet. We&rsquo;ve lined up{" "}
              {strengths.length ? strengths[0] : "fintech"} campaigns that fit you.
            </p>

            {/* The wallet is the user's, not ours — so this step is theirs to complete.
                It owns the only call to action until it is done; a second disabled
                button underneath just said the same thing twice. */}
            <WalletStep onDone={() => setWalletReady(true)} />

            {walletReady && (
              <button className="btn btn-amber ob-done-cta" onClick={() => router.push("/tasks")}>
                See your recommended campaigns
              </button>
            )}
          </div>
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
