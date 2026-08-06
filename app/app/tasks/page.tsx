"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppBar, TabBar } from "../../components/AppChrome";
import { Logo } from "../../components/Logo";
import { useProfile } from "../../components/Profile";
import { useMe } from "../../components/Me";
import { PromoterProfile } from "../../components/PromoterProfile";
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

  /**
   * The live inventory.
   *
   * Seeded from the bundled set so the grid is never empty on first paint, then
   * replaced by whatever the server actually holds. Without this a business could post
   * a campaign, land back on the marketplace, and not find it — the most obviously
   * broken thing a marketplace can do.
   */
  /**
   * Ask a new promoter what they promote — once, here, and skippable.
   *
   * Someone who switched sides from a business never gave us any of this, because
   * adding a side is instant and rightly collects nothing. But "best match" sorts
   * against exactly these strengths, so without them the feed cannot personalise.
   */
  const { me } = useMe();
  const [askProfile, setAskProfile] = useState(false);
  useEffect(() => {
    if (!me) return;
    const skipped = sessionStorage.getItem("vane-skip-promoter-profile");
    if (!skipped && (me.strengths?.length ?? 0) === 0) setAskProfile(true);
  }, [me]);

  const [campaigns, setCampaigns] = useState<Campaign[]>(allCampaigns);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        if (Array.isArray(d.campaigns) && d.campaigns.length) setCampaigns(d.campaigns);
        setStale(false);
      })
      .catch(() => {
        // Keep the seeded list rather than blanking the marketplace, but say so — a
        // failed load used to look identical to a working one, so someone could take
        // a campaign that no longer exists.
        if (live) setStale(true);
      });
    return () => {
      live = false;
    };
  }, []);

  /**
   * Clearing filters, in one place.
   *
   * The empty state had its own inline reset, so the only way to undo a filter was to
   * narrow far enough to find nothing — anyone who filtered down to two results and
   * changed their mind had to undo each control by hand.
   */
  function clearAll() {
    setIndustries(new Set());
    setEfforts(new Set());
    setVerify("all");
    setMinPay(0);
    setType("all");
    setQuery("");
  }

  /** What is currently narrowing the list, so it can be shown and removed one at a time. */
  const chips = useMemo(() => {
    const out: { key: string; label: string; clear: () => void }[] = [];
    if (query.trim()) out.push({ key: "q", label: `"${query.trim()}"`, clear: () => setQuery("") });
    if (type !== "all") out.push({ key: "type", label: TASK_TYPES.find((t) => t.id === type)?.label ?? type, clear: () => setType("all") });
    industries.forEach((i) =>
      out.push({
        key: `ind-${i}`,
        label: i,
        clear: () => setIndustries((prev) => new Set([...prev].filter((x) => x !== i))),
      }),
    );
    efforts.forEach((e) =>
      out.push({
        key: `eff-${e}`,
        label: EFFORT_LABEL[e] ?? e,
        clear: () => setEfforts((prev) => new Set([...prev].filter((x) => x !== e))),
      }),
    );
    if (verify !== "all")
      out.push({ key: "ver", label: verify === "web3" ? "Onchain" : "Integration", clear: () => setVerify("all") });
    if (minPay > 0) out.push({ key: "pay", label: `${usd(minPay)}+`, clear: () => setMinPay(0) });
    return out;
  }, [query, type, industries, efforts, verify, minPay]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = campaigns.filter((c) => {
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
  }, [campaigns, query, type, industries, efforts, verify, minPay, sort, profile.strengths]);

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

          {/* What is narrowing the list, and how to undo it — each chip on its own, or
              all at once. Without this the only route back was to filter down to
              nothing and use the empty state's reset. */}
          {askProfile && (
            <PromoterProfile
              onDone={() => {
                sessionStorage.setItem("vane-skip-promoter-profile", "1");
                setAskProfile(false);
              }}
            />
          )}

          {stale && (
            <p className="mk-stale">
              Couldn&rsquo;t reach the marketplace just now — showing what we had. Refresh for the latest.
            </p>
          )}

          {chips.length > 0 && (
            <div className="mk-chips">
              {chips.map((c) => (
                <button key={c.key} className="mk-chip" onClick={c.clear}>
                  {c.label}
                  <i aria-hidden="true">×</i>
                </button>
              ))}
              <button className="mk-chip mk-chip-clear" onClick={clearAll}>
                Clear all
              </button>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="mk-empty">
              <p>No campaigns match those filters.</p>
              <button
                className="tiny"
                style={{ color: "var(--amber)", fontWeight: 700 }}
                onClick={clearAll}
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
        <Logo src={c.logoUrl} initial={c.initial} colour={c.colour} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 14.5, letterSpacing: "-.01em" }}>{c.business}</b>
          {/* Whether this business proved it controls the brand. A promoter is about
              to put this in front of their own audience; the escrow protects their
              payout, not their reputation. */}
          <span className="tiny" style={{ display: "block", marginTop: -1 }}>
            {c.verifiedDomain ? (
              <span className="verified-domain">✓ {c.verifiedDomain}</span>
            ) : (
              c.industry
            )}
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
