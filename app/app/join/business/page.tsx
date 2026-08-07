"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Falcon, Mark } from "../../../components/Falcon";
import { useProfile } from "../../../components/Profile";
import { Upload } from "../../../components/Upload";
import { OnboardFrame } from "../../../components/Onboard";
import { WalletStep } from "../../../components/Wallet";
import { Back } from "../../../components/Back";
import { useMe } from "../../../components/Me";
import { EmailStep } from "../../../components/EmailStep";
import { INDUSTRIES, usd, type Industry } from "../../../lib/data";

/**
 * Business onboarding.
 *
 * Mirrors the tasker flow but diverges where the business is different: it asks
 * whether results happen onchain (which sets how they are verified and adapts the
 * falcon's language) and takes a logo. Money is not discussed here — a business
 * decides its budget and rate per campaign, which is the only moment USDC moves.
 */

/**
 * Onboarding asks who you are and gets you a wallet. It does not take money.
 *
 * There used to be "fund your escrow" and "stake a bond" steps offering fixed amounts
 * — $250, $500, $1,000, $2,500 — and telling the business their budget was "locked in
 * a contract" that "neither you nor Vane can move". None of that was true. Both values
 * were written to local state and read by nothing; no USDC moved and no contract was
 * touched.
 *
 * It could not have worked either way: VaneEscrow funds per campaign, because
 * `createCampaign` is what pulls the budget from the business. There is no account
 * balance to top up in advance, and offering a menu of amounts was Vane deciding
 * something that belongs to the business.
 */
type Step = "name" | "verify" | "logo" | "done";
const ORDER: Step[] = ["name", "verify", "logo", "done"];

export default function BusinessOnboarding() {
  const router = useRouter();
  const { save } = useProfile();

  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"web2" | "web3">("web3");
  const [logo, setLogo] = useState("");
  const [industry, setIndustry] = useState<Industry>("Payments");
  const [walletReady, setWalletReady] = useState(false);
  const [email, setEmail] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const emailValid = /.+@.+\..+/.test(email);

  /**
   * Pick up where the person actually is.
   *
   * The step used to live only in component state, so a refresh threw you back to
   * question one — after you had verified an email and were part way through. And a
   * signed-in account with a wallet was still shown onboarding, as though it had never
   * been here.
   *
   * So: someone already set up goes to their dashboard, someone signed in but without
   * a wallet lands on the wallet step, and a refresh mid-flow resumes rather than
   * restarting.
   */
  const { me, known } = useMe();
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem("vane-join-business") as Step | null;
    if (saved && ORDER.includes(saved)) setStep(saved);
    const savedName = sessionStorage.getItem("vane-join-business-name");
    if (savedName) setName(savedName);
  }, []);

  useEffect(() => {
    sessionStorage.setItem("vane-join-business", step);
  }, [step]);

  useEffect(() => {
    if (!me) return;
    setEmail(me.email);
    setSignedIn(true);
    // Their photo is a reasonable default logo; they can replace it a step later.
    setLogo((l) => l || me.avatar);

    if (resolved) return;
    setResolved(true);

    // Already has a wallet? Then this account is set up, and onboarding is the wrong
    // screen to be looking at.
    void fetch("/api/wallet")
      .then((r) => r.json())
      .then((w) => {
        if (w.ready) router.replace("/business");
        else setStep((cur) => (cur === "name" || cur === "verify" ? "done" : cur));
      })
      .catch(() => {});
  }, [me, resolved, router]);

  useEffect(() => {
    if (name) sessionStorage.setItem("vane-join-business-name", name);
  }, [name]);

  const idx = ORDER.indexOf(step);
  const web3 = kind === "web3";
  // The result vocabulary the falcon uses, adapted to the business kind.
  const resultWord = web3 ? "onchain conversions" : "signups and sales";

  /**
   * The session must exist before the wallet step renders — that step acts as this
   * business against Circle, and without a session it fails with "Not signed in".
   */
  async function next() {
    const n = ORDER[idx + 1];

    // Already signed in (adding a business to an existing account)? Skip proving the
    // address again — they proved it when they joined.
    if (n === "verify" && signedIn) {
      setStep("logo");
      return;
    }

    if (n === "done") {
      save({
        business: {
          onboarded: true,
          name,
          logo,
          industry,
          kind,
        },
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
      router.push(me ? "/tasks" : "/start");
      return;
    }
    setStep(ORDER[idx - 1]);
  }

  return (
    <OnboardFrame side="advertising" hero={step !== "done"} wide={step === "done"}>
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

      {step === "name" && (
        <Panel title="Tell us about your business" sub="This is who promoters and their audiences will see.">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) void next();
            }}
          >
            <div className="card" style={{ marginBottom: 16 }}>
              <label htmlFor="bn" className="eyebrow">
                Business name
              </label>
              <input id="bn" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lumen" autoFocus className="ob-input" />
            </div>

            {known && (
              <p className="tiny" style={{ marginBottom: 16 }}>
                Adding a business to <b style={{ color: "var(--ink)" }}>{email}</b>. Your wallet and details
                carry over.
              </p>
            )}

            <p className="eyebrow" style={{ marginBottom: 10 }}>
              How do your results happen?
            </p>
            {/* Only on-chain verification is built. Offering the other as a live choice
                meant a business could select it, get identical behaviour, and see its own
                card contradict what it had just said. It stays visible because it is
                genuinely next — but it cannot be chosen until it works. */}
            <div className="ob-kind">
              <button type="button" className={`ob-kindbtn ${web3 ? "on" : ""}`} onClick={() => setKind("web3")}>
                <b>An onchain business</b>
                <span>Mints, swaps, deposits and trades onchain — verified against the chain itself</span>
              </button>
              <button type="button" className="ob-kindbtn is-soon" disabled aria-disabled="true">
                <b>
                  A web business <i className="ob-soon">Coming soon</i>
                </b>
                <span>Signups and sales in your own app, reported through an integration</span>
              </button>
            </div>

            <button
              type="submit"
              className="btn btn-amber"
              disabled={!name.trim()}
              style={{ opacity: name.trim() ? 1 : 0.4, marginTop: 20 }}
            >
              Continue
            </button>
            {authError && <p className="wallet-error" style={{ marginTop: 10 }}>{authError}</p>}
          </form>
        </Panel>
      )}

      {step === "verify" && (
        <Panel title="Confirm it's you" sub="A 6-digit code, so nobody else can post campaigns in your name.">
          <EmailStep
            role="business"
            profile={{ name, avatar: logo }}
            submitLabel="Email me a code"
            onVerified={() => {
              setSignedIn(true);
              setStep("logo");
            }}
          />
        </Panel>
      )}

      {step === "logo" && (
        <Panel title="Add your logo" sub="It appears on your campaign card and your public profile. Optional, but it earns more promoters.">
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}>
            <Upload shape="avatar" value={logo} onChange={setLogo} label="Add logo" />
          </div>
          <p className="eyebrow" style={{ marginBottom: 10 }}>
            Industry
          </p>
          <div className="ob-chips">
            {INDUSTRIES.map((ind) => (
              <button key={ind} className={`ob-chip ${industry === ind ? "on" : ""}`} onClick={() => setIndustry(ind)}>
                {ind}
              </button>
            ))}
          </div>
          <button className="btn btn-amber" onClick={next} style={{ marginTop: 22 }}>
            Continue
          </button>
        </Panel>
      )}

      {step === "done" && (
        <div className="ob-done">
          <div className="ob-done-portrait">
            {logo ? (
              <span className="avatar" style={{ width: 96, height: 96, fontSize: 34, background: "var(--amber-glow)" }}>
                <img className="face" src={logo} alt="" width={96} height={96} style={{ borderRadius: "50%" }} />
              </span>
            ) : (
              <Falcon mode="idle" size={140} />
            )}
          </div>

          <div className="ob-done-body">
            <h1 style={{ fontSize: 30, lineHeight: 1.08 }}>{name || "You're"} is set up</h1>
            <p className="sub" style={{ fontSize: 15, marginTop: 10 }}>
              Next, your wallet. You decide the budget and the rate when you post a campaign — that is the
              moment USDC locks into escrow, and the falcon starts verifying {resultWord}.
            </p>

            {/* The business's funds are the business's. It signs its own escrow funding.
                WalletStep owns the CTA until the wallet exists — no second button. */}
            <WalletStep onDone={() => setWalletReady(true)} />

            {walletReady && (
              <button
                className="btn btn-amber ob-done-cta"
                onClick={() => {
                  sessionStorage.removeItem("vane-join-business");
                  sessionStorage.removeItem("vane-join-business-name");
                  router.push("/post");
                }}
              >
                Post your first campaign
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
