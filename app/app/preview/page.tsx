"use client";

import { Mark } from "../../components/Falcon";

/**
 * /preview — the Vane mobile home, rendered alone at exact phone dimensions
 * (390 x 844) with nothing else on the page, so it can be screenshotted cleanly
 * and handed to an image tool as the screen inside a photograph.
 *
 * Everything here is Vane's actual product: campaigns, verified results, payouts.
 */
export default function Preview() {
  return (
    <div className="pv-stage">
      <div className="pv">
        {/* status bar */}
        <div className="pv-status">
          <span className="num">9:41</span>
          <span className="row" style={{ gap: 5 }}>
            <svg viewBox="0 0 18 12" width="17" height="11">
              <rect x="0" y="8" width="3" height="4" rx="1" fill="#fff" />
              <rect x="4.5" y="5.5" width="3" height="6.5" rx="1" fill="#fff" />
              <rect x="9" y="3" width="3" height="9" rx="1" fill="#fff" />
              <rect x="13.5" y="0" width="3" height="12" rx="1" fill="#fff" opacity="0.4" />
            </svg>
            <svg viewBox="0 0 26 12" width="24" height="11">
              <rect x="0.5" y="0.5" width="21" height="11" rx="3.5" fill="none" stroke="#fff" opacity="0.5" />
              <rect x="2.5" y="2.5" width="14" height="7" rx="1.8" fill="#fff" />
              <path d="M23.5 4.2 v3.6 a2.4 2.4 0 0 0 0-3.6z" fill="#fff" opacity="0.5" />
            </svg>
          </span>
        </div>

        {/* brand row */}
        <div className="pv-top">
          <span className="row" style={{ gap: 9 }}>
            <Mark size={22} color="#f0a94b" />
            <b style={{ fontSize: 22, letterSpacing: "-.04em" }}>vane</b>
          </span>
          <span className="pv-av" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="17" height="17">
              <circle cx="12" cy="8.6" r="3.5" fill="none" stroke="#f0a94b" strokeWidth="2" />
              <path d="M5 19.5c1.4-3.4 3.9-5 7-5s5.6 1.6 7 5" fill="none" stroke="#f0a94b" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
        </div>

        {/* balance */}
        <div className="pv-bal">
          <span>Available to cash out</span>
          <b className="num">$2,847.50</b>
          <i className="num">↑ $12.40 earned today</i>
        </div>

        {/* active campaigns */}
        <div className="pv-sec">
          <div className="pv-sechead">
            <span>Your campaigns</span>
            <a>See all</a>
          </div>

          <div className="pv-list">
            <Row initial="L" colour="#3e6b8f" name="Lumen" note="$2.00 per verified signup" amt="$684.00" />
            <Row initial="N" colour="#8f5a3e" name="Nova Exchange" note="0.5% of every referred trade" amt="$1,392.50" live />
            <Row initial="P" colour="#5a7a4e" name="Peakform" note="$4.00 per subscription" amt="$771.00" />
          </div>
        </div>

        {/* recent results */}
        <div className="pv-sec">
          <div className="pv-sechead">
            <span>Verified &amp; paid</span>
            <a>History</a>
          </div>

          <div className="pv-list">
            <Result amt="+$2.00" who="Signup verified · Lumen" when="1.2s ago" />
            <Result amt="+$0.32" who="Trade share · Nova" when="4m ago" />
            <Result amt="+$4.00" who="Subscription · Peakform" when="26m ago" />
          </div>
        </div>

        {/* tab bar */}
        <div className="pv-tabs">
          <Tab on label="Home" d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />
          <Tab label="Campaigns" d="M4 7h16M4 12h16M4 17h10" stroke />
          <Tab label="Earnings" d="M4 17 10 10l4 3.5L20 6" stroke />
          <Tab label="Account" d="M12 5.1a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7M5 20c1.4-3.4 3.9-5 7-5s5.6 1.6 7 5" stroke />
        </div>
      </div>

      <style jsx>{`
        .pv-stage {
          min-height: 100dvh;
          display: grid;
          place-items: center;
          background: #14181d;
          padding: 20px;
        }
        .pv {
          width: 390px;
          height: 844px;
          flex-shrink: 0;
          background: radial-gradient(520px 340px at 72% -6%, rgba(240, 169, 75, 0.16), transparent 62%),
            linear-gradient(168deg, #0d141a, #080c11 62%);
          color: #f2f5f7;
          border-radius: 44px;
          padding: 0 22px;
          display: flex;
          flex-direction: column;
          font-family: ui-rounded, "SF Pro Rounded", -apple-system, "Segoe UI", system-ui, sans-serif;
          overflow: hidden;
        }
        .row {
          display: flex;
          align-items: center;
        }
        .num {
          font-variant-numeric: tabular-nums;
        }
        .pv-status {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 8px 0;
          font-size: 14px;
          font-weight: 700;
        }
        .pv-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 22px 0 0;
        }
        .pv-av {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: rgba(240, 169, 75, 0.14);
        }
        .pv-bal {
          padding: 30px 0 26px;
        }
        .pv-bal span {
          font-size: 13.5px;
          color: #8c99a2;
        }
        .pv-bal b {
          display: block;
          font-size: 46px;
          font-weight: 800;
          letter-spacing: -0.045em;
          line-height: 1.1;
          margin-top: 4px;
          color: #f7b45c;
          text-shadow: 0 0 34px rgba(240, 169, 75, 0.5);
        }
        .pv-bal i {
          display: inline-block;
          margin-top: 10px;
          font-style: normal;
          font-size: 12.5px;
          font-weight: 800;
          color: #4fc08d;
          background: rgba(79, 192, 141, 0.14);
          border-radius: 100px;
          padding: 5px 11px;
        }
        .pv-sec {
          margin-bottom: 22px;
        }
        .pv-sechead {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 11px;
        }
        .pv-sechead span {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #7f8b94;
        }
        .pv-sechead a {
          font-size: 12.5px;
          font-weight: 700;
          color: #f0a94b;
        }
        .pv-list {
          background: linear-gradient(165deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.03));
          border-radius: 22px;
          padding: 4px 16px;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07);
        }
        .pv-tabs {
          margin-top: auto;
          display: flex;
          justify-content: space-between;
          padding: 14px 6px 26px;
        }
      `}</style>
    </div>
  );
}

function Row({
  initial,
  colour,
  name,
  note,
  amt,
  live,
}: {
  initial: string;
  colour: string;
  name: string;
  note: string;
  amt: string;
  live?: boolean;
}) {
  return (
    <div className="r">
      <span className="ic" style={{ background: colour }}>
        {initial}
      </span>
      <span className="t">
        <b>
          {name}
          {live && <i />}
        </b>
        <span>{note}</span>
      </span>
      <b className="a num">{amt}</b>

      <style jsx>{`
        .r {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 13px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .r:last-child {
          border-bottom: none;
        }
        .ic {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          font-size: 13px;
          font-weight: 800;
          color: #fff;
          flex-shrink: 0;
        }
        .t {
          flex: 1;
          min-width: 0;
        }
        .t b {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 14.5px;
          letter-spacing: -0.01em;
        }
        .t b i {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #4fc08d;
          box-shadow: 0 0 8px #4fc08d;
        }
        .t span {
          font-size: 12px;
          color: #838f98;
        }
        .a {
          font-size: 15px;
          font-weight: 800;
          letter-spacing: -0.02em;
        }
      `}</style>
    </div>
  );
}

function Result({ amt, who, when }: { amt: string; who: string; when: string }) {
  return (
    <div className="r">
      <span className="tick">✓</span>
      <span className="t">
        <b>{who}</b>
        <span>{when}</span>
      </span>
      <b className="a num">{amt}</b>

      <style jsx>{`
        .r {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 13px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .r:last-child {
          border-bottom: none;
        }
        .tick {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: rgba(79, 192, 141, 0.15);
          color: #4fc08d;
          font-weight: 800;
          font-size: 13px;
          flex-shrink: 0;
        }
        .t {
          flex: 1;
          min-width: 0;
        }
        .t b {
          display: block;
          font-size: 14px;
          letter-spacing: -0.01em;
        }
        .t span {
          font-size: 12px;
          color: #838f98;
        }
        .a {
          font-size: 15px;
          font-weight: 800;
          color: #4fc08d;
        }
      `}</style>
    </div>
  );
}

function Tab({ label, d, on, stroke }: { label: string; d: string; on?: boolean; stroke?: boolean }) {
  return (
    <span className={`tb ${on ? "on" : ""}`}>
      <svg viewBox="0 0 24 24" width="22" height="22">
        <path
          d={d}
          fill={stroke ? "none" : "currentColor"}
          stroke={stroke ? "currentColor" : "none"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <i>{label}</i>

      <style jsx>{`
        .tb {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 5px;
          color: #6d7a83;
          width: 74px;
        }
        .tb.on {
          color: #f0a94b;
        }
        .tb i {
          font-style: normal;
          font-size: 10.5px;
          font-weight: 700;
        }
      `}</style>
    </span>
  );
}
