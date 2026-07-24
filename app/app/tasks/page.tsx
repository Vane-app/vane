"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppBar, TabBar } from "../../components/AppChrome";
import { useProfile } from "../../components/Profile";
import {
  allCampaigns,
  INDUSTRIES,
  TASK_TYPES,
  SORTS,
  EFFORT_LABEL,
  sortCampaigns,
  usd,
  rate,
  rateNote,
  poolPercent,
  remaining,
  daysLeft,
  type Campaign,
  type TaskType,
  type Industry,
  type Effort,
  type SortKey,
} from "../../lib/data";

/**
 * Browse — the marketplace.
 *
 * The pattern a marketplace actually uses: prominent search, task-type tabs, a
 * filter rail, a sort control, a live result count, and a grid — two to four
 * columns on a laptop, one on a phone where the filters fold into a sheet.
 */
export default function Browse() {
  const { profile } = useProfile();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<TaskType | "all">("all");
  const [industries, setIndustries] = useState<Set<Industry>>(new Set());
  const [efforts, setEfforts] = useState<Set<Effort>>(new Set());
  const [verify, setVerify] = useState<"all" | "web3" | "web2">("all");
  const [minPay, setMinPay] = useState(0);
  const [sort, setSort] = useState<SortKey>("top");
  const [sheet, setSheet] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = allCampaigns.filter((c) => {
      if (type !== "all" && c.taskType !== type) return false;
      if (industries.size && !industries.has(c.industry)) return false;
      if (efforts.size && !efforts.has(c.effort)) return false;
      if (verify === "web3" && !c.web3) return false;
      if (verify === "web2" && c.web3) return false;
      if (c.rewardPerAction < minPay) return false;
      if (q && ![c.business, c.blurb, c.industry, c.taskType].some((f) => f.toLowerCase().includes(q))) return false;
      return true;
    });
    const sorted = sortCampaigns(list, sort);
    // Under "best match", campaigns that fit the tasker's strengths lead the grid
    // — recommendations folded into the marketplace, not a separate duplicated row.
    if (sort === "top" && profile.strengths.length) {
      const strong = new Set(profile.strengths);
      return [...sorted].sort((a, b) => Number(strong.has(b.industry)) - Number(strong.has(a.industry)));
    }
    return sorted;
  }, [query, type, industries, efforts, verify, minPay, sort, profile.strengths]);

  const forYou = new Set(profile.strengths);

  function toggle<T>(set: Set<T>, value: T, apply: (s: Set<T>) => void) {
    const next = new Set(set);
    next.has(value) ? next.delete(value) : next.add(value);
    apply(next);
  }

  const activeFilters = industries.size + efforts.size + (verify !== "all" ? 1 : 0) + (minPay > 0 ? 1 : 0);

  const filters = (
    <>
      <FilterGroup title="Verification">
        {(
          [
            ["all", "Any"],
            ["web3", "Onchain (trustless)"],
            ["web2", "Integration"],
          ] as [typeof verify, string][]
        ).map(([v, label]) => (
          <Radio key={v} on={verify === v} onClick={() => setVerify(v)}>
            {label}
          </Radio>
        ))}
      </FilterGroup>

      <FilterGroup title="Effort">
        {(Object.keys(EFFORT_LABEL) as Effort[]).map((e) => (
          <Check key={e} on={efforts.has(e)} onClick={() => toggle(efforts, e, setEfforts)}>
            {EFFORT_LABEL[e]}
          </Check>
        ))}
      </FilterGroup>

      <FilterGroup title="Minimum payout">
        {[
          [0, "Any"],
          [1_000_000, "$1+"],
          [5_000_000, "$5+"],
          [10_000_000, "$10+"],
        ].map(([v, label]) => (
          <Radio key={label} on={minPay === v} onClick={() => setMinPay(v as number)}>
            {label as string}
          </Radio>
        ))}
      </FilterGroup>

      <FilterGroup title="Industry">
        {INDUSTRIES.map((ind) => (
          <Check key={ind} on={industries.has(ind)} onClick={() => toggle(industries, ind, setIndustries)}>
            {ind}
          </Check>
        ))}
      </FilterGroup>
    </>
  );

  return (
    <main className="screen">
      <AppBar />

      <header className="mk-head fade-up">
        <div>
          <h1 style={{ fontSize: 28, lineHeight: 1.1 }}>Discover campaigns</h1>
          <p className="sub" style={{ fontSize: 13.5, marginTop: 5, maxWidth: "42ch" }}>
            Every budget is locked in escrow. The falcon verifies every result and pays you in seconds.
          </p>
        </div>
        <Link href="/post" className="btn btn-amber mk-post">
          Post a campaign
        </Link>
      </header>

      <div className="mk-search fade-up d1">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M16 16 L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search businesses, industries, task types…"
          aria-label="Search campaigns"
        />
        {query && (
          <button onClick={() => setQuery("")} aria-label="Clear" className="mk-clear">
            ✕
          </button>
        )}
      </div>

      <div className="mk-tabs fade-up d1" role="tablist">
        <button className={`mk-tab ${type === "all" ? "on" : ""}`} onClick={() => setType("all")} role="tab">
          All
        </button>
        {TASK_TYPES.map((t) => (
          <button key={t.id} className={`mk-tab ${type === t.id ? "on" : ""}`} onClick={() => setType(t.id)} role="tab">
            {t.label}
          </button>
        ))}
      </div>

      <div className="mk-body">
        <aside className="mk-rail">{filters}</aside>

        <div className="mk-results">
          <div className="mk-bar">
            <span className="tiny">
              <b className="num" style={{ color: "var(--ink)", fontWeight: 700 }}>
                {filtered.length}
              </b>{" "}
              {filtered.length === 1 ? "campaign" : "campaigns"}
            </span>

            <div className="row" style={{ gap: 8 }}>
              <button className="mk-filterbtn" onClick={() => setSheet(true)}>
                Filters{activeFilters > 0 && <i className="mk-count">{activeFilters}</i>}
              </button>
              <label className="mk-sort">
                Sort
                <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                  {SORTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="mk-empty">
              <p>No campaigns match those filters.</p>
              <button
                className="tiny"
                style={{ color: "var(--amber)", fontWeight: 700 }}
                onClick={() => {
                  setIndustries(new Set());
                  setEfforts(new Set());
                  setVerify("all");
                  setMinPay(0);
                  setType("all");
                  setQuery("");
                }}
              >
                Clear everything
              </button>
            </div>
          ) : (
            <div className="mk-grid">
              {filtered.map((c) => (
                <CampaignCard key={c.id} c={c} forYou={forYou.has(c.industry)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {sheet && (
        <div className="sheet-scrim" onClick={() => setSheet(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grab" aria-hidden="true" />
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <b style={{ fontSize: 17 }}>Filters</b>
              <button className="tiny" onClick={() => setSheet(false)} style={{ color: "var(--amber)", fontWeight: 700 }}>
                Done
              </button>
            </div>
            {filters}
          </div>
        </div>
      )}

      <TabBar />
    </main>
  );
}

function CampaignCard({ c, forYou }: { c: Campaign; forYou?: boolean }) {
  const typeLabel = TASK_TYPES.find((t) => t.id === c.taskType)?.label ?? "";
  return (
    <Link href={`/campaign/${c.id}`} className="mk-card fade-up">
      <div className="row" style={{ gap: 11, marginBottom: 14 }}>
        <span className="avatar" style={{ background: c.colour, width: 34, height: 34, fontSize: 13 }} aria-hidden="true">
          {c.initial}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 14.5, letterSpacing: "-.01em" }}>{c.business}</b>
          <span className="tiny" style={{ display: "block", marginTop: -1 }}>
            {c.industry}
          </span>
        </div>
        {forYou && <span className="badge badge-foryou">For you</span>}
        {c.bonded && <span className="badge badge-bonded">Bonded</span>}
      </div>

      <div className="mk-tags">
        <span className="mk-tag">{typeLabel}</span>
        <span className={`mk-tag ${c.web3 ? "onchain" : ""}`}>{c.web3 ? "Onchain" : "Integration"}</span>
      </div>

      <div className="you-earn" style={{ marginTop: 14 }}>
        <span className="you-earn-rate num">{rate(c)}</span>
        <span className="you-earn-note">{rateNote(c)}</span>
      </div>

      <div className="poolbar" style={{ marginTop: 14 }}>
        <i style={{ width: `${poolPercent(c)}%` }} />
      </div>
      <div className="row" style={{ justifyContent: "space-between", marginTop: 9 }}>
        <span className="tiny num">{usd(remaining(c), { cents: false })} funded</span>
        <span className="tiny num">{daysLeft(c)} days · {c.taken} taken</span>
      </div>
    </Link>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="fg">
      <h3>{title}</h3>
      <div className="fg-items">{children}</div>
    </div>
  );
}

function Check({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`fopt ${on ? "on" : ""}`} onClick={onClick} role="checkbox" aria-checked={on}>
      <span className="fbox" aria-hidden="true">
        {on && "✓"}
      </span>
      {children}
    </button>
  );
}

function Radio({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`fopt ${on ? "on" : ""}`} onClick={onClick} role="radio" aria-checked={on}>
      <span className="fdot" aria-hidden="true" />
      {children}
    </button>
  );
}
