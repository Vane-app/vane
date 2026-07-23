import Link from "next/link";
import { Mark } from "../../components/Falcon";

/**
 * App entry. One job: which side of the marketplace are you on.
 * No pitch — whoever reaches this screen has already decided to try it.
 */
export default function Start() {
  return (
    <main className="startpage">
      <div className="fade-up" style={{ textAlign: "center", marginBottom: 34 }}>
        <span className="row" style={{ gap: 10, marginBottom: 30, justifyContent: "center" }}>
          <Mark size={26} color="var(--amber)" />
          <b style={{ fontSize: 25, letterSpacing: "-.04em" }}>vane</b>
        </span>
        <h1 style={{ fontSize: "clamp(30px, 4vw, 44px)", lineHeight: 1.05 }}>Which side are you on?</h1>
        <p className="sub" style={{ fontSize: 15, marginTop: 12, maxWidth: "34ch", marginInline: "auto" }}>
          You can switch later. Nothing here needs a card or a wallet.
        </p>
      </div>

      <nav className="start-choices" aria-label="Choose how you use Vane">
        <Link href="/join/tasker" className="card fade-up d1" style={{ display: "block" }}>
          <span className="row" style={{ gap: 14 }}>
            <span className="choice-ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22">
                <path d="M13 2 L5.5 13.5 H11 L10 22 L18.5 10 H13 Z" fill="var(--amber)" />
              </svg>
            </span>
            <span style={{ flex: 1 }}>
              <b style={{ fontSize: 17, display: "block", letterSpacing: "-.015em" }}>I want to earn</b>
              <span className="tiny">Take a campaign, get paid per verified result</span>
            </span>
            <Arrow />
          </span>
        </Link>

        <Link href="/join/business" className="card fade-up d2" style={{ display: "block" }}>
          <span className="row" style={{ gap: 14 }}>
            <span className="choice-ic" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22">
                <path
                  d="M4 18 L10 11 L14 14.5 L20 6.5 M15 6 h5.5 v5.5"
                  fill="none"
                  stroke="var(--amber)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span style={{ flex: 1 }}>
              <b style={{ fontSize: 17, display: "block", letterSpacing: "-.015em" }}>I want results</b>
              <span className="tiny">Fund a campaign, pay only for what converts</span>
            </span>
            <Arrow />
          </span>
        </Link>
      </nav>

      <p className="tiny fade-up d3" style={{ textAlign: "center", marginTop: 26 }}>
        Under a minute either way.
      </p>
    </main>
  );
}

function Arrow() {
  return (
    <span className="choice-go" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="18" height="18">
        <path
          d="M5 12 h13 M12.5 6 L18.5 12 L12.5 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
