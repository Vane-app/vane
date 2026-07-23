"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Falcon, Mark } from "../../../components/Falcon";
import { useProfile } from "../../../components/Profile";
import { Upload } from "../../../components/Upload";
import { INDUSTRIES, usd, type Industry } from "../../../lib/data";

/**
 * Business onboarding.
 *
 * Mirrors the tasker flow but diverges where the business is different: it asks
 * whether you're a web or onchain business (which sets how results are verified
 * and adapts the falcon's language), takes a logo, and — the real difference —
 * has you *fund* an escrow wallet and optionally stake a bond for the Bonded
 * tier. A business puts money in; a tasker only takes it out.
 */

type Step = "name" | "logo" | "fund" | "bond" | "done";
const ORDER: Step[] = ["name", "logo", "fund", "bond", "done"];

const FUND_OPTIONS = [250, 500, 1000, 2500];
const BOND_OPTIONS = [0, 200, 500];

export default function BusinessOnboarding() {
  const router = useRouter();
  const { save } = useProfile();

  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"web2" | "web3">("web2");
  const [logo, setLogo] = useState("");
  const [industry, setIndustry] = useState<Industry>("Payments");
  const [funded, setFunded] = useState(500);
  const [bond, setBond] = useState(0);

  const idx = ORDER.indexOf(step);
  const web3 = kind === "web3";
  // The result vocabulary the falcon uses, adapted to the business kind.
  const resultWord = web3 ? "onchain conversions" : "signups and sales";

  function next() {
    const n = ORDER[idx + 1];
    if (n === "done") {
      save({
        business: {
          onboarded: true,
          name,
          logo,
          industry,
          kind,
          funded: funded * 1_000_000,
          bond: bond * 1_000_000,
        },
      });
    }
    setStep(n);
  }

  return (
    <main className="screen ob">
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

      {step === "name" && (
        <Panel title="Tell us about your business" sub="This is who promoters and their audiences will see.">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) next();
            }}
          >
            <div className="card" style={{ marginBottom: 16 }}>
              <label htmlFor="bn" className="eyebrow">
                Business name
              </label>
              <input id="bn" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lumen" autoFocus className="ob-input" />
            </div>

            <p className="eyebrow" style={{ marginBottom: 10 }}>
              How do your results happen?
            </p>
            <div className="ob-kind">
              <button type="button" className={`ob-kindbtn ${!web3 ? "on" : ""}`} onClick={() => setKind("web2")}>
                <b>A web business</b>
                <span>Signups, sales and subscriptions in your own app</span>
              </button>
              <button type="button" className={`ob-kindbtn ${web3 ? "on" : ""}`} onClick={() => setKind("web3")}>
                <b>An onchain business</b>
                <span>Mints, swaps, deposits and trades onchain</span>
              </button>
            </div>

            <button type="submit" className="btn btn-amber" disabled={!name.trim()} style={{ opacity: name.trim() ? 1 : 0.4, marginTop: 20 }}>
              Continue
            </button>
          </form>
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

      {step === "fund" && (
        <Panel
          title="Fund your escrow"
          sub={`Your budget is locked in a contract and only released for verified ${resultWord}. Whatever isn't used comes back to you.`}
        >
          <div className="ob-fund">
            {FUND_OPTIONS.map((v) => (
              <button key={v} className={`ob-fundopt ${funded === v ? "on" : ""}`} onClick={() => setFunded(v)}>
                <b className="num">{usd(v * 1_000_000, { cents: false })}</b>
                <span>≈ {Math.floor(v / 2)} results</span>
              </button>
            ))}
          </div>
          <p className="tiny" style={{ marginTop: 14 }}>
            On testnet this is funded from the Circle faucet. Neither you nor Vane can move it once locked —
            only verified results release it.
          </p>
          <button className="btn btn-amber" onClick={next} style={{ marginTop: 22 }}>
            Add {usd(funded * 1_000_000, { cents: false })}
          </button>
        </Panel>
      )}

      {step === "bond" && (
        <Panel
          title="Become a Bonded business"
          sub="Stake a refundable deposit to earn the Bonded badge. It signals you stand behind your campaigns — and promoters trust bonded businesses first."
        >
          <div className="ob-bond">
            {BOND_OPTIONS.map((v) => (
              <button key={v} className={`ob-bondopt ${bond === v ? "on" : ""}`} onClick={() => setBond(v)}>
                <div>
                  <b>{v === 0 ? "Not now" : `Stake ${usd(v * 1_000_000, { cents: false })}`}</b>
                  <span>{v === 0 ? "You can bond later" : v >= 500 ? "Top ranking + fastest approval" : "Bonded badge + higher ranking"}</span>
                </div>
                {v > 0 && <span className="badge badge-bonded">Bonded</span>}
              </button>
            ))}
          </div>
          <p className="tiny" style={{ marginTop: 14 }}>
            The bond is returned in full when your campaigns close on a clean record. It only covers disputes
            if a result is wrongly claimed against you.
          </p>
          <button className="btn btn-amber" onClick={next} style={{ marginTop: 22 }}>
            {bond > 0 ? `Stake ${usd(bond * 1_000_000, { cents: false })} & finish` : "Finish"}
          </button>
        </Panel>
      )}

      {step === "done" && (
        <div className="ob-done">
          {logo ? (
            <span className="avatar" style={{ width: 96, height: 96, fontSize: 34, background: "var(--amber-glow)" }}>
              <img className="face" src={logo} alt="" width={96} height={96} style={{ borderRadius: "50%" }} />
            </span>
          ) : (
            <Falcon mode="idle" size={140} />
          )}
          <div className="row" style={{ gap: 8, marginTop: 14 }}>
            <h1 style={{ fontSize: 30, lineHeight: 1.08 }}>{name || "You're"} is set up</h1>
            {bond > 0 && <span className="badge badge-bonded">Bonded</span>}
          </div>
          <p className="sub" style={{ fontSize: 15, marginTop: 10, maxWidth: "34ch", marginInline: "auto" }}>
            {usd(funded * 1_000_000, { cents: false })} is ready in escrow. Post your first campaign and the
            falcon starts verifying {resultWord} the moment they happen.
          </p>
          <button className="btn btn-amber" style={{ marginTop: 28, maxWidth: 360 }} onClick={() => router.push("/post")}>
            Post your first campaign
          </button>
        </div>
      )}
    </main>
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
