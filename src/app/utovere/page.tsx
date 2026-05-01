"use client";

import React, { useEffect, useMemo, useState } from "react";
import TrendChart from "@/components/utovere/TrendChart";
import TopLeaderboards from "@/components/utovere/TopLeaderBoards";
import type { AthleteHit, AthleteResultRow, DistanceCategory } from "@/components/utovere/types";
import { formatDate, formatTime, mean, mostCommon, pctChange, scoreHit, yearFromDate } from "@/components/utovere/utils";

const FILTERS: { key: DistanceCategory; label: string; long: string }[] = [
  { key: "5K",    label: "5K",   long: "5 Kilometer"  },
  { key: "10K",   label: "10K",  long: "10 Kilometer" },
  { key: "HM",    label: "HM",   long: "Halvmaraton"  },
  { key: "M",     label: "MAR",  long: "Maraton"      },
  { key: "OTHER", label: "ETC",  long: "Annet"        },
];

const DIST_M: Record<DistanceCategory, number | null> = {
  "5K": 5000, "10K": 10000, "HM": 21097, "M": 42195, "OTHER": null,
};

function pace(ms: number, dm: number | null): string | null {
  if (!dm || !ms) return null;
  const spk = ms / 1000 / (dm / 1000);
  return `${Math.floor(spk / 60)}:${String(Math.round(spk % 60)).padStart(2, "0")}/km`;
}

function trendDir(change: number | null) {
  if (change === null) return { symbol: "→", css: "neutral", label: "Stabil" };
  if (change < -2)     return { symbol: "↑", css: "up",      label: "Forbedring" };
  if (change > 2)      return { symbol: "↓", css: "dn",      label: "Nedgang" };
  return                      { symbol: "→", css: "neutral", label: "Stabil" };
}

const STRIP = [
  { num: "14k+", label: "Utøvere" },
  { num: "320",  label: "Løp 2026" },
  { num: "48k",  label: "Resultater" },
  { num: "Live", label: "Oppdatert" },
];

export default function UtoverePage() {
  const [refreshing, setRefreshing]             = useState(false);
  const [q, setQ]                               = useState("");
  const [hits, setHits]                         = useState<AthleteHit[]>([]);
  const [loadingHits, setLoadingHits]           = useState(false);
  const [selected, setSelected]                 = useState<AthleteHit | null>(null);
  const [results, setResults]                   = useState<AthleteResultRow[]>([]);
  const [loadingResults, setLoadingResults]     = useState(false);
  const [filter, setFilter]                     = useState<DistanceCategory>("HM");
  const [ranks2026, setRanks2026]               = useState<Record<string, { rank: number; total: number } | null>>({});
  const [ranksLoading, setRanksLoading]         = useState(false);
  const [sortBy, setSortBy]                     = useState<"date" | "time">("date");
  const [sortDir, setSortDir]                   = useState<"asc" | "desc">("desc");

  const canSearch = q.trim().length >= 2;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const aid = params.get("athleteId");
    if (!aid) return;
    fetch(`/api/athletes/${aid}`).then(r => r.json()).then(a => { if (a?.id) loadResults(a); });
  }, []);

  useEffect(() => {
    if (!selected?.id) { setRanks2026({}); return; }
    let cancelled = false;
    setRanksLoading(true);
    const cats = FILTERS.filter(f => f.key !== "OTHER").map(f => f.key);
    Promise.all(cats.map(cat =>
      fetch(`/api/rankings?athleteId=${encodeURIComponent(selected.id)}&category=${encodeURIComponent(cat)}&year=2026`, { cache: "no-store" })
        .then(r => r.json()).then(d => ({ cat, d })).catch(() => ({ cat, d: null }))
    )).then(all => {
      if (cancelled) return;
      const map: Record<string, { rank: number; total: number } | null> = {};
      for (const { cat, d } of all)
        map[cat] = d?.ok && Number.isFinite(d?.rank) ? { rank: d.rank, total: d.total } : null;
      setRanks2026(map);
    }).finally(() => { if (!cancelled) setRanksLoading(false); });
    return () => { cancelled = true; };
  }, [selected?.id]);

  useEffect(() => {
    if (!canSearch || selected) { setHits([]); setLoadingHits(false); return; }
    setLoadingHits(true);
    const t = setTimeout(async () => {
      try {
        const data = await fetch(`/api/athletes/search?q=${encodeURIComponent(q.trim())}`).then(r => r.json());
        const arr: AthleteHit[] = Array.isArray(data) ? data : [];
        const scored = arr.map(h => ({ h, s: scoreHit(q, h.display_name) }))
          .filter(x => x.s > 0).sort((a, b) => b.s - a.s);
        const top = scored[0]?.s ?? 0;
        setHits(scored.filter((x, i) => i === 0 || x.s >= Math.max(320, top - 280)).slice(0, 8).map(x => x.h));
      } catch { setHits([]); }
      finally { setLoadingHits(false); }
    }, 220);
    return () => clearTimeout(t);
  }, [q, canSearch, selected]);

  async function loadResults(a: AthleteHit) {
    setSelected(a); setLoadingResults(true); setResults([]);
    const loadNow = async () => {
      const data = await fetch(`/api/athletes/${a.id}/results`, { cache: "no-store" }).then(r => r.json());
      setResults(Array.isArray(data) ? data : []);
    };
    try { await loadNow(); } finally { setLoadingResults(false); }
    setRefreshing(true);
    fetch(`/api/athletes/${a.id}/refresh-eqtiming`, { method: "POST" })
      .then(() => loadNow()).finally(() => setRefreshing(false));
  }

  const club = useMemo(() => mostCommon(results.map(r => r.club)), [results]);
  const age  = selected?.birth_year ? new Date().getFullYear() - selected.birth_year : null;

  const byCategory = useMemo(() => {
    const map = new Map<DistanceCategory, AthleteResultRow[]>();
    for (const r of results) {
      const c = (r.distance_category ?? "OTHER") as DistanceCategory;
      map.set(c, [...(map.get(c) ?? []), r]);
    }
    return map;
  }, [results]);

  const prs = useMemo(() =>
    FILTERS.filter(f => f.key !== "OTHER").map(f => {
      const arr = (byCategory.get(f.key) ?? []).slice().sort((a, b) => a.time_ms - b.time_ms);
      if (!arr.length) return null;
      return { cat: f.key, best: arr[0], count: arr.length, avg: mean(arr.map(x => x.time_ms)) };
    }).filter(Boolean) as { cat: DistanceCategory; best: AthleteResultRow; count: number; avg: number }[],
  [byCategory]);

  const filtered = useMemo(
    () => results.filter(r => (r.distance_category ?? "OTHER") === filter),
    [results, filter]
  );

  const sorted = useMemo(() => filtered.slice().sort((a, b) => {
    if (sortBy === "time") { const v = a.time_ms - b.time_ms; return sortDir === "asc" ? v : -v; }
    const v = (a.start_date ?? "").localeCompare(b.start_date ?? "");
    return sortDir === "asc" ? v : -v;
  }), [filtered, sortBy, sortDir]);

  const trendStats = useMemo(() => {
    const arr   = sorted.filter(r => r.start_date).slice().sort((a, b) => a.start_date! < b.start_date! ? -1 : 1);
    const times = arr.map(x => x.time_ms);
    const first = arr[0] ?? null;
    const last  = arr[arr.length - 1] ?? null;
    const best  = arr.slice().sort((a, b) => a.time_ms - b.time_ms)[0] ?? null;
    const change = first && last ? pctChange(last.time_ms, first.time_ms) : null;
    return { avgT: mean(times), last, best, trend: trendDir(change), count: arr.length };
  }, [sorted]);

  const activeFilt = FILTERS.find(f => f.key === filter)!;
  const activeDM   = DIST_M[filter];
  const activeRank = ranks2026[filter];

  function handleBack() {
    setSelected(null); setResults([]); setFilter("HM");
    setSortBy("date"); setSortDir("desc"); setQ(""); setHits([]); setRanks2026({});
  }

  return (
    <div className="cpn-root">
      <header className="cpn-header">
        <span className="cpn-logo">Løpsresultater</span>
        <span className="cpn-header-right">{new Date().getFullYear()} Season</span>
      </header>

      {/* ══ HOME ══ */}
      {!selected && (
        <>
          <div className="cpn-hero">
            <div>
              <div className="cpn-hero-eyebrow">Database · Søk · 2026 Sesong</div>
              <h1 className="cpn-hero-title">Utøver&shy;søk</h1>
            </div>
            <p className="cpn-hero-desc">Søk blant tusenvis av norske løpere. Se personlige rekorder, resultater på tvers av distanser og rangeringer for inneværende sesong.</p>
          </div>
          <div className="cpn-stats-strip">
            {STRIP.map(s => (
              <div key={s.label} className="cpn-strip-stat">
                <div className="cpn-strip-num">{s.num}</div>
                <div className="cpn-strip-label">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="cpn-search-wrap">
            <div className="cpn-search-label">Søk utøver</div>
            <div className="cpn-search-row">
              <input className="cpn-search-input" placeholder="Skriv navn…" value={q}
                onChange={e => setQ(e.target.value)} autoComplete="off" />
              {q.trim().length > 0 && <button className="cpn-search-clear" onClick={() => setQ("")}>✕ tøm</button>}
            </div>
            {q.trim().length > 0 && (
              <div className="cpn-search-status">
                {loadingHits ? "søker…" : hits.length > 0 ? `${hits.length} forslag` : "ingen treff"}
              </div>
            )}
            {q.trim().length > 0 && !loadingHits && hits.length > 0 && (
              <div className="cpn-hits">
                {hits.map((h, idx) => (
                  <button key={h.id} className="cpn-hit" onClick={() => loadResults(h)}>
                    <div>
                      <div className="cpn-hit-name">{h.display_name}</div>
                      <div className="cpn-hit-meta">
                        {h.birth_year ? `Født ${h.birth_year}` : "Utøver"}
                        {idx === 0 && <span className="cpn-hit-badge">Best match</span>}
                      </div>
                    </div>
                    <span className="cpn-hit-arrow">→</span>
                  </button>
                ))}
              </div>
            )}
            {q.trim().length > 0 && !loadingHits && hits.length === 0 && (
              <div className="cpn-hits" style={{ padding: "14px 20px" }}>
                <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--fg-3)" }}>
                  Ingen treff. Prøv færre ord.
                </span>
              </div>
            )}
          </div>
          <div className="cpn-home-sections">
            <TopLeaderboards year={2026} onSelectAthlete={loadResults} />
          </div>
        </>
      )}

      {/* ══ ATHLETE PROFILE ══ */}
      {selected && (
        <div className="ath-root">

          {/* ── DARK HERO ── */}
          <div className="ath-hero">
            <button className="ath-back" onClick={handleBack}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Tilbake
            </button>

            <div className="ath-hero-inner">
              {/* Left: identity */}
              <div className="ath-identity">
                <div className="ath-initials">
                  {selected.display_name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()}
                </div>
                <div>
                  <h1 className="ath-name">{selected.display_name}</h1>
                  <p className="ath-meta">
                    {[
                      selected.birth_year ? `Født ${selected.birth_year}${age ? ` · ${age} år` : ""}` : null,
                      club,
                    ].filter(Boolean).join("  ·  ")}
                    {refreshing && <span className="ath-refreshing"> · ⟳ oppdaterer</span>}
                  </p>
                  {/* Dist pills */}
                  <div className="ath-dist-pills">
                    {prs.map(p => {
                      const r = ranks2026[p.cat];
                      return (
                        <button
                          key={p.cat}
                          className={`ath-dist-pill${filter === p.cat ? " active" : ""}`}
                          onClick={() => setFilter(p.cat)}
                        >
                          {FILTERS.find(f => f.key === p.cat)?.label}
                          {r && <span className="ath-pill-rank">#{r.rank}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right: top PBs as large numbers */}
              {prs.length > 0 && (
                <div className="ath-hero-pbs">
                  {prs.slice(0, 3).map((p, i) => (
                    <button
                      key={p.cat}
                      className={`ath-hero-pb${filter === p.cat ? " active" : ""}`}
                      onClick={() => setFilter(p.cat)}
                    >
                      <span className="ath-hero-pb-dist">{FILTERS.find(f => f.key === p.cat)?.label}</span>
                      <span className="ath-hero-pb-time">{formatTime(p.best.time_ms)}</span>
                      <span className="ath-hero-pb-sub">PB · {p.count} løp</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Ranking stripe */}
            {(Object.values(ranks2026).some(Boolean) || ranksLoading) && (
              <div className="ath-rank-stripe">
                <span className="ath-rank-stripe-label">2026 rangeringer</span>
                {ranksLoading && !Object.values(ranks2026).some(Boolean) ? (
                  <span className="ath-rank-loading">henter…</span>
                ) : (
                  FILTERS.filter(f => f.key !== "OTHER" && ranks2026[f.key] != null).map(f => {
                    const r = ranks2026[f.key]!;
                    return (
                      <button
                        key={f.key}
                        className={`ath-rank-chip${filter === f.key ? " active" : ""}`}
                        onClick={() => setFilter(f.key)}
                      >
                        <span className="ath-rank-chip-dist">{f.label}</span>
                        <span className="ath-rank-chip-rank">#{r.rank}</span>
                        <span className="ath-rank-chip-total">av {r.total.toLocaleString("nb-NO")}</span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* ── DISTANCE TABS ── */}
          <div className="ath-tabs">
            {FILTERS.map(f => (
              <button
                key={f.key}
                className={`ath-tab${filter === f.key ? " active" : ""}`}
                onClick={() => setFilter(f.key)}
              >
                <span className="ath-tab-label">{f.label}</span>
                {byCategory.get(f.key)?.length
                  ? <span className="ath-tab-count">{byCategory.get(f.key)!.length}</span>
                  : null}
              </button>
            ))}
          </div>

          {/* ── PB CARD + STATS ── */}
          {trendStats.count > 0 && (
            <div className="ath-stats-zone">

              {/* Hero PB card */}
              <div className="ath-pb-hero">
                <div className="ath-pb-eyebrow">Personlig rekord · {activeFilt.long}</div>
                <div className="ath-pb-big">
                  {trendStats.best ? formatTime(trendStats.best.time_ms) : "—"}
                </div>
                {trendStats.best && (
                  <div className="ath-pb-context">
                    {pace(trendStats.best.time_ms, activeDM) && (
                      <span className="ath-pb-pace">{pace(trendStats.best.time_ms, activeDM)}</span>
                    )}
                    <span className="ath-pb-event">{trendStats.best.event_name}</span>
                    <span className="ath-pb-date">{formatDate(trendStats.best.start_date)}</span>
                  </div>
                )}
                {activeRank && (
                  <div className="ath-pb-rank-badge">
                    <span className="ath-pb-rank-num">#{activeRank.rank}</span>
                    <span className="ath-pb-rank-label">i Norge 2026 · av {activeRank.total.toLocaleString("nb-NO")}</span>
                  </div>
                )}
              </div>

              {/* Stat cells */}
              <div className="ath-stat-cells">
                <div className="ath-stat-cell">
                  <div className="ath-stat-cell-label">Siste løp</div>
                  <div className="ath-stat-cell-val">{trendStats.last ? formatTime(trendStats.last.time_ms) : "—"}</div>
                  <div className="ath-stat-cell-hint">{trendStats.last ? formatDate(trendStats.last.start_date) : "—"}</div>
                </div>
                <div className="ath-stat-cell">
                  <div className="ath-stat-cell-label">Snitt</div>
                  <div className="ath-stat-cell-val">{trendStats.avgT ? formatTime(trendStats.avgT) : "—"}</div>
                  <div className="ath-stat-cell-hint">{trendStats.avgT ? (pace(trendStats.avgT, activeDM) ?? "") : "—"}</div>
                </div>
                <div className="ath-stat-cell">
                  <div className="ath-stat-cell-label">Antall løp</div>
                  <div className="ath-stat-cell-val">{trendStats.count}</div>
                  <div className="ath-stat-cell-hint">{activeFilt.long}</div>
                </div>
                <div className={`ath-stat-cell ath-stat-cell--trend ath-stat-cell--${trendStats.trend.css}`}>
                  <div className="ath-stat-cell-label">Trend</div>
                  <div className="ath-stat-cell-val">{trendStats.trend.symbol}</div>
                  <div className="ath-stat-cell-hint">{trendStats.trend.label}</div>
                </div>
              </div>
            </div>
          )}

          {/* No results for this distance */}
          {trendStats.count === 0 && (
            <div className="ath-no-dist">
              Ingen {activeFilt.long.toLowerCase()}-resultater registrert.
            </div>
          )}

          {/* ── CHART ── */}
          {sorted.length > 1 && (
            <div className="ath-chart-section">
              <div className="ath-section-label">Utvikling over tid</div>
              <TrendChart rows={sorted} />
            </div>
          )}

          {/* ── RESULTS ── */}
          {sorted.length > 0 && (
          <div className="ath-results-section">
            <div className="ath-results-head">
              <div className="ath-section-label" style={{ marginBottom: 0 }}>
                {activeFilt.long}
                <span className="ath-results-count">{sorted.length} løp</span>
              </div>
              <div className="ath-sort-row">
                {[
                  { key: "date",  label: "Dato" },
                  { key: "time",  label: "Tid"  },
                ].map(s => (
                  <button
                    key={s.key}
                    className={`ath-sort-btn${sortBy === s.key ? " active" : ""}`}
                    onClick={() => setSortBy(s.key as "date" | "time")}
                  >
                    {s.label}
                  </button>
                ))}
                <button
                  className="ath-sort-btn"
                  onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
                >
                  {sortDir === "asc" ? "↑" : "↓"}
                </button>
              </div>
            </div>

            {loadingResults && <div className="ath-loading">Laster resultater…</div>}

            {!loadingResults && sorted.length > 0 && (
              <div className="ath-result-list">
                {sorted.map((r, i) => {
                  const p           = pace(r.time_ms, activeDM);
                  const hasRank     = r.rank_overall != null && r.total_finishers != null;
                  const isTop3      = (r.rank_overall ?? 999) <= 3;
                  const isTop3G     = (r.rank_gender  ?? 999) <= 3;
                  const gTotal      = selected?.gender === "M" ? r.total_finishers_m
                                    : selected?.gender === "F" ? r.total_finishers_f : null;
                  const medal       = r.rank_overall === 1 ? "🥇" : r.rank_overall === 2 ? "🥈" : r.rank_overall === 3 ? "🥉" : null;

                  return (
                    <div key={i} className={`ath-result${isTop3 ? " ath-result--podium" : ""}`}>

                      {/* Left: index + podium indicator */}
                      <div className="ath-result-idx">
                        {isTop3 && medal
                          ? <span className="ath-result-medal">{medal}</span>
                          : <span className="ath-result-num">{i + 1}</span>}
                      </div>

                      {/* Center: event info */}
                      <div className="ath-result-event">
                        <div className="ath-result-name">{r.event_name}</div>
                        <div className="ath-result-sub">
                          {r.race_name !== r.event_name && r.race_name + " · "}
                          {formatDate(r.start_date)}
                          {r.club ? ` · ${r.club}` : ""}
                        </div>
                      </div>

                      {/* Rank block */}
                      {hasRank && (
                        <div className="ath-result-rank">
                          <div className="ath-result-rank-overall">
                            {r.rank_overall}
                            <span className="ath-result-rank-denom">/{r.total_finishers?.toLocaleString("nb-NO")}</span>
                          </div>
                          {r.rank_gender != null && gTotal != null && (
                            <div className={`ath-result-rank-gender${isTop3G ? " top" : ""}`}>
                              {r.rank_gender}. {selected?.gender === "F" ? "dame" : "herre"}
                              <span className="ath-result-rank-denom"> /{gTotal.toLocaleString("nb-NO")}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Time block */}
                      <div className="ath-result-time-block">
                        <div className="ath-result-time">{formatTime(r.time_ms)}</div>
                        {p && <div className="ath-result-pace">{p}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          )}

        </div>
      )}
    </div>
  );
}