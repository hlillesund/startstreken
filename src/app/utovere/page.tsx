"use client";

import React, { useEffect, useMemo, useState } from "react";
import TrendChart from "@/components/utovere/TrendChart";
import TopLeaderboards from "@/components/utovere/TopLeaderBoards";
import UpcomingRacesPlaceholder from "@/components/utovere/UpcomingRaces";
import type { AthleteHit, AthleteResultRow, DistanceCategory } from "@/components/utovere/types";
import { formatDate, formatTime, mean, mostCommon, pctChange, scoreHit, yearFromDate } from "@/components/utovere/utils";

const FILTERS: { key: DistanceCategory; label: string; long: string }[] = [
  { key: "5K",    label: "5K",  long: "5 Kilometer"  },
  { key: "10K",   label: "10K", long: "10 Kilometer" },
  { key: "HM",    label: "HM",  long: "Halvmaraton"  },
  { key: "M",     label: "MAR", long: "Maraton"      },
  { key: "OTHER", label: "ETC", long: "Annet"        },
];

const DISTANCE_METERS: Record<DistanceCategory, number | null> = {
  "5K": 5000, "10K": 10000, "HM": 21097, "M": 42195, "OTHER": null,
};

function formatPace(time_ms: number, distanceMeters: number | null): string | null {
  if (!distanceMeters || !time_ms) return null;
  const secsPerKm = time_ms / 1000 / (distanceMeters / 1000);
  const mins = Math.floor(secsPerKm / 60);
  const secs = Math.round(secsPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}/km`;
}

function trendArrow(change: number | null): { symbol: string; color: string; label: string } {
  if (change === null) return { symbol: "→", color: "var(--fg-3)", label: "uendret" };
  if (change < -2)     return { symbol: "↑", color: "var(--success)", label: "forbedring" };
  if (change > 2)      return { symbol: "↓", color: "var(--danger)",  label: "nedgang" };
  return { symbol: "→", color: "var(--fg-3)", label: "stabil" };
}

// ─── Stats strip data ────────────────────────────────────────────────────────
const STRIP_STATS = [
  { num: "14k+", label: "Utøvere registrert" },
  { num: "320",  label: "Løp i 2026" },
  { num: "48k",  label: "Resultater totalt" },
  { num: "Live", label: "Oppdatert nå" },
];

export default function UtoverePage() {
  const [refreshing, setRefreshing]   = useState(false);
  const [q, setQ]                     = useState("");
  const [hits, setHits]               = useState<AthleteHit[]>([]);
  const [loadingHits, setLoadingHits] = useState(false);
  const [selected, setSelected]       = useState<AthleteHit | null>(null);
  const [results, setResults]         = useState<AthleteResultRow[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [filter, setFilter]           = useState<DistanceCategory>("HM");
  const [ranks2026, setRanks2026]     = useState<Record<string, { rank: number; total: number } | null>>({});
  const [ranksLoading, setRanksLoading] = useState(false);
  const [sortBy, setSortBy]           = useState<"date" | "time">("date");
  const [sortDir, setSortDir]         = useState<"asc" | "desc">("desc");

  const canSearch = q.trim().length >= 2;

  // ─── Deep-link by athleteId ───────────────────────────────────────────────
  useEffect(() => {
    const params    = new URLSearchParams(window.location.search);
    const athleteId = params.get("athleteId");
    if (!athleteId) return;
    fetch(`/api/athletes/${athleteId}`)
      .then((r) => r.json())
      .then((a) => { if (a?.id) loadResults(a); });
  }, []);

  // ─── Rankings per category ────────────────────────────────────────────────
  useEffect(() => {
    if (!selected?.id) { setRanks2026({}); return; }
    let cancelled = false;
    setRanksLoading(true);
    const cats = FILTERS.filter((f) => f.key !== "OTHER").map((f) => f.key);
    Promise.all(
      cats.map((cat) =>
        fetch(`/api/rankings?athleteId=${encodeURIComponent(selected.id)}&category=${encodeURIComponent(cat)}&year=2026`, { cache: "no-store" })
          .then((r) => r.json())
          .then((data) => ({ cat, data }))
          .catch(() => ({ cat, data: null }))
      )
    ).then((all) => {
      if (cancelled) return;
      const map: Record<string, { rank: number; total: number } | null> = {};
      for (const { cat, data } of all)
        map[cat] = data?.ok && Number.isFinite(data?.rank) ? { rank: data.rank, total: data.total } : null;
      setRanks2026(map);
    }).finally(() => { if (!cancelled) setRanksLoading(false); });
    return () => { cancelled = true; };
  }, [selected?.id]);

  // ─── Search ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!canSearch || selected) { setHits([]); setLoadingHits(false); return; }
    setLoadingHits(true);
    const t = setTimeout(async () => {
      try {
        const data = await fetch(`/api/athletes/search?q=${encodeURIComponent(q.trim())}`).then((r) => r.json());
        const arr: AthleteHit[] = Array.isArray(data) ? data : [];
        const scored = arr
          .map((h) => ({ h, s: scoreHit(q, h.display_name) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s);
        const top = scored[0]?.s ?? 0;
        setHits(scored.filter((x, i) => i === 0 || x.s >= Math.max(320, top - 280)).slice(0, 8).map((x) => x.h));
      } catch { setHits([]); }
      finally { setLoadingHits(false); }
    }, 220);
    return () => clearTimeout(t);
  }, [q, canSearch, selected]);

  // ─── Load athlete results ─────────────────────────────────────────────────
  async function loadResults(a: AthleteHit) {
    setSelected(a);
    setLoadingResults(true);
    setResults([]);
    const loadNow = async () => {
      const data = await fetch(`/api/athletes/${a.id}/results`, { cache: "no-store" }).then((r) => r.json());
      setResults(Array.isArray(data) ? data : []);
    };
    try { await loadNow(); } finally { setLoadingResults(false); }
    setRefreshing(true);
    fetch(`/api/athletes/${a.id}/refresh-eqtiming`, { method: "POST" })
      .then(() => loadNow())
      .finally(() => setRefreshing(false));
  }

  // ─── Derived ──────────────────────────────────────────────────────────────
  const club = useMemo(() => mostCommon(results.map((r) => r.club)), [results]);
  const age  = selected?.birth_year ? new Date().getFullYear() - selected.birth_year : null;

  const filtered = useMemo(
    () => results.filter((r) => (r.distance_category ?? "OTHER") === filter),
    [results, filter]
  );

  const sorted = useMemo(() => {
    return filtered.slice().sort((a, b) => {
      if (sortBy === "time") { const v = a.time_ms - b.time_ms; return sortDir === "asc" ? v : -v; }
      const v = (a.start_date ?? "").localeCompare(b.start_date ?? "");
      return sortDir === "asc" ? v : -v;
    });
  }, [filtered, sortBy, sortDir]);

  const byCategory = useMemo(() => {
    const map = new Map<DistanceCategory, AthleteResultRow[]>();
    for (const r of results) {
      const c = (r.distance_category ?? "OTHER") as DistanceCategory;
      map.set(c, [...(map.get(c) ?? []), r]);
    }
    return map;
  }, [results]);

  const prs = useMemo(
    () =>
      FILTERS.filter(({ key }) => key !== "OTHER")
        .map(({ key }) => {
          const arr = (byCategory.get(key) ?? []).slice().sort((a, b) => a.time_ms - b.time_ms);
          if (arr.length === 0) return null;
          return { cat: key, best: arr[0], count: arr.length, avg: mean(arr.map((x) => x.time_ms)) };
        })
        .filter(Boolean) as { cat: DistanceCategory; best: AthleteResultRow; count: number; avg: number }[],
    [byCategory]
  );

  const rankedCats = useMemo(
    () => FILTERS.filter((f) => f.key !== "OTHER" && ranks2026[f.key] != null),
    [ranks2026]
  );

  const trendStats = useMemo(() => {
    const arr   = sorted.filter((r) => r.start_date).slice().sort((a, b) => (a.start_date! < b.start_date! ? -1 : 1));
    const times = arr.map((x) => x.time_ms);
    const first = arr[0] ?? null;
    const last  = arr[arr.length - 1] ?? null;
    const best  = arr.slice().sort((a, b) => a.time_ms - b.time_ms)[0] ?? null;
    const change = first && last ? pctChange(last.time_ms, first.time_ms) : null;
    return { avgT: mean(times), last, best, trend: trendArrow(change), count: arr.length };
  }, [sorted]);

  const activeFilt     = FILTERS.find((f) => f.key === filter)!;
  const activeDistMeters = DISTANCE_METERS[filter];

  return (
    <div className="cpn-root" style={{ paddingTop: "var(--topnav-h)" }}>

      {/* ── HEADER STRIP ── */}
      <header className="cpn-header">
        <meta name="google-adsense-account" content="ca-pub-7553946899442750" />
        <span className="cpn-logo">Løpsresultater</span>
        <span className="cpn-header-right">{new Date().getFullYear()} Season</span>
      </header>

      {/* ── HOME VIEW ── */}
      {!selected && (
        <>
          {/* Hero */}
          <div className="cpn-hero">
            <div>
              <div className="cpn-hero-eyebrow">Database · Søk · 2026 Sesong</div>
              <h1 className="cpn-hero-title">Utøver&shy;søk</h1>
            </div>
            <p className="cpn-hero-desc">
              Søk blant tusenvis av norske løpere. Se personlige rekorder, resultater
              på tvers av distanser og sanntids&shy;rangeringer for inneværende sesong.
            </p>
          </div>

          {/* Stats strip */}
          <div className="cpn-stats-strip">
            {STRIP_STATS.map((s) => (
              <div key={s.label} className="cpn-strip-stat">
                <div className="cpn-strip-num">{s.num}</div>
                <div className="cpn-strip-label">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="cpn-search-wrap">
            <div className="cpn-search-label">Søk utøver</div>
            <div className="cpn-search-row">
              <input
                className="cpn-search-input"
                placeholder="Skriv navn…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                autoComplete="off"
              />
              {q.trim().length > 0 && (
                <button className="cpn-search-clear" onClick={() => setQ("")}>✕ tøm</button>
              )}
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

          {/* Home sections: leaderboards etc. */}
          <div className="cpn-home-sections">
            <TopLeaderboards year={2026} onSelectAthlete={loadResults} />
          </div>
        </>
      )}

      {/* ── ATHLETE PROFILE ── */}
      {selected && (
        <div className="cpn-profile">

          {/* 1. NAME */}
          <div className="cpn-athlete-header">
            <div>
              <button
                className="cpn-back"
                onClick={() => {
                  setSelected(null); setResults([]); setFilter("HM");
                  setSortBy("date"); setSortDir("desc"); setQ(""); setHits([]); setRanks2026({});
                }}
              >
                ← Tilbake
              </button>
              <h2 className="cpn-athlete-name">{selected.display_name}</h2>
              <div className="cpn-athlete-sub">
                {[
                  selected.birth_year ? `Født ${selected.birth_year}${age ? ` · ${age} år` : ""}` : null,
                  club,
                ].filter(Boolean).join("  ·  ")}
              </div>
            </div>
            {refreshing && (
              <div className="cpn-refreshing">
                <span className="cpn-spin">⟳</span> Oppdaterer
              </div>
            )}
          </div>

          {/* 2. PERSONAL RECORDS */}
          {prs.length > 0 && (
            <div className="cpn-pr-section">
              <div className="cpn-section-label">Personlige rekorder</div>
              <div className="cpn-pr-table">
                <div className="cpn-pr-head">
                  <div className="cpn-pr-th">Distanse</div>
                  <div className="cpn-pr-th">PB</div>
                  <div className="cpn-pr-th">Snitt</div>
                  <div className="cpn-pr-th">#</div>
                </div>
                {prs.map((p) => (
                  <button
                    key={p.cat}
                    className={`cpn-pr-row${filter === p.cat ? " active" : ""}`}
                    onClick={() => setFilter(p.cat)}
                  >
                    <div className="cpn-pr-td name">{FILTERS.find((f) => f.key === p.cat)?.long}</div>
                    <div className="cpn-pr-td">
                      {formatTime(p.best.time_ms)}
                      {formatPace(p.best.time_ms, DISTANCE_METERS[p.cat]) && (
                        <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", opacity: 0.5, marginLeft: 6 }}>
                          ({formatPace(p.best.time_ms, DISTANCE_METERS[p.cat])})
                        </span>
                      )}
                    </div>
                    <div className="cpn-pr-td">
                      {p.avg ? (
                        <>
                          {formatTime(p.avg)}
                          {formatPace(p.avg, DISTANCE_METERS[p.cat]) && (
                            <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", opacity: 0.5, marginLeft: 6 }}>
                              ({formatPace(p.avg, DISTANCE_METERS[p.cat])})
                            </span>
                          )}
                        </>
                      ) : "—"}
                    </div>
                    <div className="cpn-pr-td">{p.count}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 3. RANKINGS 2026 */}
          {(rankedCats.length > 0 || ranksLoading) && (
            <div className="cpn-stats-section">
              <div className="cpn-section-label">Rangeringer 2026</div>
              {ranksLoading && rankedCats.length === 0 ? (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="cpn-spin">⟳</span> Henter rangeringer…
                </div>
              ) : (
                <div style={{ border: "1px solid var(--line)" }}>
                  {rankedCats.map((f, i) => {
                    const r = ranks2026[f.key]!;
                    const catResults = (byCategory.get(f.key) ?? []).filter((x) => yearFromDate(x.start_date) === 2026);
                    const pb2026    = catResults.length ? catResults.slice().sort((a, b) => a.time_ms - b.time_ms)[0] : null;
                    return (
                      <div
                        key={f.key}
                        className="cpn-rank-strip"
                        style={{
                          border: "none",
                          borderBottom: i < rankedCats.length - 1 ? "1px solid var(--line)" : "none",
                          marginTop: 0,
                        }}
                      >
                        <div className="cpn-rank-label" style={{ minWidth: 72 }}>{f.long}</div>
                        <div className="cpn-rank-val" style={{ fontSize: 14, fontFamily: "var(--font-mono)" }}>
                          {pb2026 ? formatTime(pb2026.time_ms) : "—"}
                        </div>
                        <div className="cpn-rank-label">Plassering</div>
                        <div className="cpn-rank-val">{`#${r.rank}`}</div>
                        <div className="cpn-rank-label">Av totalt</div>
                        <div className="cpn-rank-val" style={{ borderRight: "none" }}>{r.total}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 4. DISTANCE TABS */}
          <div className="cpn-tabs">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={`cpn-tab${filter === f.key ? " active" : ""}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* 5. KEY STATS */}
          <div className="cpn-stats-section">
            <div className="cpn-section-label">{activeFilt.long} — Nøkkeltall</div>
            <div className="cpn-stat-grid">
              <div className="cpn-stat">
                <div className="cpn-stat-label">Antall</div>
                <div className="cpn-stat-value">{trendStats.count}</div>
                <div className="cpn-stat-hint">resultater</div>
              </div>
              <div className={`cpn-stat${trendStats.best ? " accent" : ""}`}>
                <div className="cpn-stat-label">PB</div>
                <div className="cpn-stat-value">{trendStats.best ? formatTime(trendStats.best.time_ms) : "—"}</div>
                <div className="cpn-stat-hint">
                  {trendStats.best
                    ? [trendStats.best.event_name, formatPace(trendStats.best.time_ms, activeDistMeters)].filter(Boolean).join(" · ")
                    : "ingen"}
                </div>
              </div>
              <div className="cpn-stat">
                <div className="cpn-stat-label">Gjennomsnitt</div>
                <div className="cpn-stat-value">{trendStats.avgT ? formatTime(trendStats.avgT) : "—"}</div>
                <div className="cpn-stat-hint">{trendStats.avgT ? (formatPace(trendStats.avgT, activeDistMeters) ?? "snitt-tid") : "—"}</div>
              </div>
              <div className="cpn-stat">
                <div className="cpn-stat-label">Siste</div>
                <div className="cpn-stat-value">{trendStats.last ? formatTime(trendStats.last.time_ms) : "—"}</div>
                <div className="cpn-stat-hint">{trendStats.last ? formatDate(trendStats.last.start_date) : "—"}</div>
              </div>
              <div className="cpn-stat">
                <div className="cpn-stat-label">Trend</div>
                <div className="cpn-stat-value" style={{ color: trendStats.trend.color, fontSize: 32, fontFamily: "var(--font-body)" }}>
                  {trendStats.trend.symbol}
                </div>
                <div className="cpn-stat-hint">{trendStats.trend.label}</div>
              </div>
            </div>
          </div>

          {/* 6. CHART */}
          <div className="cpn-chart-section">
            <div className="cpn-section-label">{activeFilt.long} — Utvikling over tid</div>
            {sorted.length > 1
              ? <TrendChart rows={sorted} />
              : <p className="cpn-empty">Ikke nok datapunkter til å vise graf.</p>}
          </div>
{/* 7. RESULTS */}
          <div className="cpn-results-section">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div className="cpn-section-label" style={{ marginBottom: 0 }}>
                {activeFilt.long} — {sorted.length} resultat{sorted.length !== 1 ? "er" : ""}
              </div>
              <div className="cpn-sort-row">
                <span className="cpn-sort-label">Sorter</span>
                <button className={`cpn-sort-btn${sortBy === "date" ? " active" : ""}`} onClick={() => setSortBy("date")}>Dato</button>
                <button className={`cpn-sort-btn${sortBy === "time" ? " active" : ""}`} onClick={() => setSortBy("time")}>Tid</button>
                <button className="cpn-sort-btn" onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}>
                  {sortDir === "asc" ? "↑ asc" : "↓ desc"}
                </button>
              </div>
            </div>

            {loadingResults && <p className="cpn-empty">Laster resultater…</p>}
            {!loadingResults && sorted.length === 0 && (
              <p className="cpn-no-results">
                {refreshing ? "Henter data…" : "Ingen resultater i denne kategorien."}
              </p>
            )}

            {!loadingResults && sorted.length > 0 && (
              <div className="cpn-table">
                {/* Desktop header */}
                <div className="cpn-table-head cpn-table-head--ranked">
                  <div className="cpn-th">Dato</div>
                  <div className="cpn-th">Løp</div>
                  <div className="cpn-th cpn-th--right">Plassering</div>
                  <div className="cpn-th cpn-th--right">Tid</div>
                </div>

                {sorted.map((r, i) => {
                  const pace = formatPace(r.time_ms, activeDistMeters);
                  const hasRank = r.rank_overall != null && r.total_finishers != null;
                  const hasGender = r.rank_gender != null;
                  const isTop3Overall = (r.rank_overall ?? 999) <= 3;
                  const isTop3Gender  = (r.rank_gender  ?? 999) <= 3;

                  // Gender label based on athlete gender
                  const genderTotal = selected?.gender === "M"
                    ? r.total_finishers_m
                    : selected?.gender === "F"
                    ? r.total_finishers_f
                    : null;

                  return (
                    <div
                      key={i}
                      className={`cpn-tr cpn-tr--ranked${isTop3Overall ? " cpn-tr--podium" : ""}`}
                    >
                      {/* Date */}
                      <div className="cpn-td">
                        <span className="cpn-td-date">{formatDate(r.start_date)}</span>
                      </div>

                      {/* Race name */}
                      <div className="cpn-td">
                        <span className="cpn-td-main">{r.event_name}</span>
                        <span className="cpn-td-sub">
                          {r.race_name}{r.club ? ` · ${r.club}` : ""}
                        </span>
                      </div>

                      {/* Placement */}
                      <div className="cpn-td cpn-td--right">
                        {hasRank ? (
                          <div className="cpn-placement">
                            {/* Overall rank */}
                            <span className={`cpn-rank${isTop3Overall ? " cpn-rank--top" : ""}`}>
                              {isTop3Overall && (
                                <span className="cpn-rank-medal">
                                  {r.rank_overall === 1 ? "🥇" : r.rank_overall === 2 ? "🥈" : "🥉"}
                                </span>
                              )}
                              <span className="cpn-rank-num">{r.rank_overall}</span>
                              <span className="cpn-rank-denom">/{r.total_finishers?.toLocaleString("nb-NO")}</span>
                            </span>
                            {/* Gender rank */}
                            {hasGender && genderTotal != null && (
                              <span className={`cpn-rank-gender${isTop3Gender ? " cpn-rank-gender--top" : ""}`}>
                                {isTop3Gender && (
                                  <span className="cpn-rank-medal cpn-rank-medal--sm">
                                    {r.rank_gender === 1 ? "🥇" : r.rank_gender === 2 ? "🥈" : "🥉"}
                                  </span>
                                )}
                                {r.rank_gender}. {selected?.gender === "F" ? "dame" : "herre"}
                                <span className="cpn-rank-denom"> /{genderTotal.toLocaleString("nb-NO")}</span>
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="cpn-rank-empty">—</span>
                        )}
                      </div>

                      {/* Time */}
                      <div className="cpn-td cpn-td--right">
                        <span className="cpn-time">{formatTime(r.time_ms)}</span>
                        {pace && (
                          <span className="cpn-pace">{pace}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
<div className="cpn-table-foot">
                  Viser {sorted.length} resultat{sorted.length !== 1 ? "er" : ""} · {activeFilt.long}
                </div>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}