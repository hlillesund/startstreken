"use client";

import React, { useEffect, useMemo, useState } from "react";
import TrendChart from "@/components/utovere/TrendChart";
import TopLeaderboards from "@/components/utovere/TopLeaderBoards";
import type { AthleteHit, AthleteResultRow, DistanceCategory } from "@/components/utovere/types";
import { formatDate, formatTime, mean, mostCommon, pctChange, scoreHit } from "@/components/utovere/utils";

const FILTERS: { key: DistanceCategory; label: string; long: string }[] = [
  { key: "5K",    label: "5K",  long: "5 Kilometer"  },
  { key: "10K",   label: "10K", long: "10 Kilometer" },
  { key: "HM",    label: "HM",  long: "Halvmaraton"  },
  { key: "M",     label: "MAR", long: "Maraton"      },
  { key: "OTHER", label: "ETC", long: "Annet"        },
];

const DIST_M: Record<DistanceCategory, number | null> = {
  "5K": 5000, "10K": 10000, "HM": 21097, "M": 42195, "OTHER": null,
};

const ATHLETE_COLORS = ["#E8FF5A", "#60a5fa", "#f472b6", "#34d399"];
const ATHLETE_DARK   = ["#1a1a00", "#1e3a5f", "#4a0a2e", "#064e3b"];

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

interface AthleteData {
  hit:     AthleteHit;
  results: AthleteResultRow[];
  ranks:   Record<string, { rank: number; total: number } | null>;
}

function getPBs(results: AthleteResultRow[]) {
  const map = new Map<DistanceCategory, AthleteResultRow>();
  for (const r of results) {
    const cat = (r.distance_category ?? "OTHER") as DistanceCategory;
    const cur = map.get(cat);
    if (!cur || r.time_ms < cur.time_ms) map.set(cat, r);
  }
  return map;
}

function getSharedRaces(athletes: AthleteData[]) {
  if (athletes.length < 2) return [];
  const raceMap = new Map<string, (AthleteResultRow | null)[]>();
  athletes.forEach((ath, athIdx) => {
    for (const r of ath.results) {
      if (!r.race_id) continue;
      if (!raceMap.has(r.race_id)) raceMap.set(r.race_id, new Array(athletes.length).fill(null));
      raceMap.get(r.race_id)![athIdx] = r;
    }
  });
  const shared: { race_id: string; event_name: string; start_date: string | null; distance_category: string | null; results: (AthleteResultRow | null)[] }[] = [];
  for (const [race_id, results] of raceMap.entries()) {
    if (results.filter(Boolean).length < 2) continue;
    const sample = results.find(Boolean)!;
    shared.push({ race_id, event_name: sample.event_name, start_date: sample.start_date, distance_category: sample.distance_category, results });
  }
  return shared.sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? ""));
}

/* ── Comparison View ────────────────────────────────────────────────────── */
function CompareView({ athletes, onRemove, onAddSearch, onClose }: {
  athletes: AthleteData[]; onRemove: (id: string) => void;
  onAddSearch: () => void; onClose: () => void;
}) {
  const sharedRaces = useMemo(() => getSharedRaces(athletes), [athletes]);
  const pbMaps = useMemo(() => athletes.map(a => getPBs(a.results)), [athletes]);
  const distCats: DistanceCategory[] = ["5K", "10K", "HM", "M"];

  const wins = useMemo(() => {
    const counts = new Array(athletes.length).fill(0);
    for (const race of sharedRaces) {
      let bestMs = Infinity, winnerIdx = -1;
      race.results.forEach((r, i) => { if (r && r.time_ms < bestMs) { bestMs = r.time_ms; winnerIdx = i; } });
      if (winnerIdx >= 0) counts[winnerIdx]++;
    }
    return counts;
  }, [sharedRaces, athletes]);

  const cols = athletes.length;
  const gridCols = `80px repeat(${cols}, 1fr)`;
  const h2hCols  = `1fr repeat(${cols}, 130px)`;

  return (
    <div className="cmp-root">
      <div className="cmp-header">
        <div className="cmp-header-left">
          <button className="ath-back" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Tilbake
          </button>
          <span className="cmp-title">Sammenlign</span>
        </div>
        <div className="cmp-athlete-tags">
          {athletes.map((a, i) => (
            <div key={a.hit.id} className="cmp-athlete-tag" style={{ borderColor: ATHLETE_COLORS[i] }}>
              <span className="cmp-tag-dot" style={{ background: ATHLETE_COLORS[i] }} />
              <span style={{ color: ATHLETE_COLORS[i] }}>{a.hit.display_name.split(" ")[0]}</span>
              <button className="cmp-tag-remove" onClick={() => onRemove(a.hit.id)}>✕</button>
            </div>
          ))}
          {athletes.length < 4 && (
            <button className="cmp-add-btn" onClick={onAddSearch}>+ Legg til</button>
          )}
        </div>
      </div>

      {/* Identity row */}
      <div className="cmp-identity-row" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {athletes.map((a, i) => (
          <div key={a.hit.id} className="cmp-identity-cell" style={{ borderTopColor: ATHLETE_COLORS[i] }}>
            <div className="cmp-initials" style={{ background: ATHLETE_COLORS[i], color: ATHLETE_DARK[i] }}>
              {a.hit.display_name.split(" ").slice(0, 2).map((w: string) => w[0]).join("").toUpperCase()}
            </div>
            <div className="cmp-ath-name">{a.hit.display_name}</div>
            <div className="cmp-ath-meta">
              {a.hit.birth_year ? `Født ${a.hit.birth_year}` : ""}
            </div>
            {sharedRaces.length > 0 && (
              <div className="cmp-wins">
                <span className="cmp-wins-num" style={{ color: ATHLETE_COLORS[i] }}>{wins[i]}</span>
                <span className="cmp-wins-label">seier{wins[i] !== 1 ? "er" : ""}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* PB table */}
      <div className="cmp-section">
        <div className="cmp-section-label">Personlige rekorder</div>
        <div className="cmp-table">
          <div className="cmp-table-head" style={{ gridTemplateColumns: gridCols }}>
            <div className="cmp-th-dist" />
            {athletes.map((a, i) => (
              <div key={a.hit.id} className="cmp-th-ath" style={{ color: ATHLETE_COLORS[i] }}>
                {a.hit.display_name.split(" ")[0]}
              </div>
            ))}
          </div>
          {distCats.map(cat => {
            const label = FILTERS.find(f => f.key === cat)?.label ?? cat;
            const times = pbMaps.map(pm => pm.get(cat)?.time_ms ?? null);
            if (!times.some(t => t != null)) return null;
            const minTime = Math.min(...times.filter((t): t is number => t != null));
            return (
              <div key={cat} className="cmp-table-row" style={{ gridTemplateColumns: gridCols }}>
                <div className="cmp-td-dist">{label}</div>
                {times.map((t, i) => {
                  const isBest = t === minTime && times.filter(x => x === minTime).length === 1;
                  return (
                    <div key={i} className={`cmp-td${isBest ? " best" : ""}`}
                      style={isBest ? { borderBottomColor: ATHLETE_COLORS[i] } : {}}>
                      {t != null ? (
                        <>
                          <span className="cmp-td-time" style={isBest ? { color: ATHLETE_COLORS[i] } : {}}>
                            {isBest && <span className="cmp-crown">▲ </span>}
                            {formatTime(t)}
                          </span>
                          {t !== minTime && <span className="cmp-td-diff">+{formatTime(t - minTime)}</span>}
                          <span className="cmp-td-pace">{pace(t, DIST_M[cat])}</span>
                        </>
                      ) : <span className="cmp-td-none">—</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* 2026 Rankings */}
      {distCats.some(cat => athletes.some(a => a.ranks[cat] != null)) && (
        <div className="cmp-section cmp-section--alt">
          <div className="cmp-section-label">2026 Rangeringer</div>
          <div className="cmp-table">
            <div className="cmp-table-head" style={{ gridTemplateColumns: gridCols }}>
              <div className="cmp-th-dist" />
              {athletes.map((a, i) => (
                <div key={a.hit.id} className="cmp-th-ath" style={{ color: ATHLETE_COLORS[i] }}>
                  {a.hit.display_name.split(" ")[0]}
                </div>
              ))}
            </div>
            {distCats.map(cat => {
              const label = FILTERS.find(f => f.key === cat)?.label ?? cat;
              const ranks = athletes.map(a => a.ranks[cat] ?? null);
              if (!ranks.some(Boolean)) return null;
              const minRank = Math.min(...ranks.filter((r): r is { rank: number; total: number } => r != null).map(r => r.rank));
              return (
                <div key={cat} className="cmp-table-row" style={{ gridTemplateColumns: gridCols }}>
                  <div className="cmp-td-dist">{label}</div>
                  {ranks.map((r, i) => {
                    const isBest = r != null && r.rank === minRank;
                    return (
                      <div key={i} className={`cmp-td${isBest ? " best" : ""}`}
                        style={isBest ? { borderBottomColor: ATHLETE_COLORS[i] } : {}}>
                        {r ? (
                          <>
                            <span className="cmp-td-time" style={isBest ? { color: ATHLETE_COLORS[i] } : {}}>
                              {isBest && <span className="cmp-crown">▲ </span>}#{r.rank}
                            </span>
                            <span className="cmp-td-pace">av {r.total.toLocaleString("nb-NO")}</span>
                          </>
                        ) : <span className="cmp-td-none">—</span>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Head-to-head */}
      <div className="cmp-section">
        <div className="cmp-section-label">
          Head-to-head{sharedRaces.length > 0 ? ` · ${sharedRaces.length} felles løp` : ""}
        </div>
        {sharedRaces.length === 0 ? (
          <div className="cmp-no-shared">Ingen felles løp registrert ennå.</div>
        ) : (
          <div className="cmp-table">
            <div className="cmp-table-head" style={{ gridTemplateColumns: h2hCols }}>
              <div className="cmp-th-event">Løp</div>
              {athletes.map((a, i) => (
                <div key={a.hit.id} className="cmp-th-ath" style={{ color: ATHLETE_COLORS[i] }}>
                  {a.hit.display_name.split(" ")[0]}
                </div>
              ))}
            </div>
            {sharedRaces.map(race => {
              let bestMs = Infinity, winnerIdx = -1;
              race.results.forEach((r, i) => { if (r && r.time_ms < bestMs) { bestMs = r.time_ms; winnerIdx = i; } });
              return (
                <div key={race.race_id} className="cmp-table-row" style={{ gridTemplateColumns: h2hCols }}>
                  <div className="cmp-td-event">
                    <div className="cmp-td-event-name">{race.event_name}</div>
                    <div className="cmp-td-event-meta">
                      {formatDate(race.start_date)}{race.distance_category ? ` · ${race.distance_category}` : ""}
                    </div>
                  </div>
                  {race.results.map((r, i) => {
                    const isWinner = i === winnerIdx && r != null;
                    return (
                      <div key={i} className={`cmp-td${isWinner ? " best" : ""}`}
                        style={isWinner ? { borderBottomColor: ATHLETE_COLORS[i] } : {}}>
                        {r ? (
                          <>
                            <span className="cmp-td-time" style={isWinner ? { color: ATHLETE_COLORS[i] } : {}}>
                              {isWinner && <span className="cmp-crown">▲ </span>}
                              {formatTime(r.time_ms)}
                            </span>
                            {r.rank_overall != null && (
                              <span className="cmp-td-pace">#{r.rank_overall}/{r.total_finishers}</span>
                            )}
                          </>
                        ) : <span className="cmp-td-none">DNS</span>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Add Athlete Overlay ─────────────────────────────────────────────────── */
function AddAthleteOverlay({ exclude, onSelect, onClose }: {
  exclude: string[]; onSelect: (hit: AthleteHit) => void; onClose: () => void;
}) {
  const [q, setQ]         = useState("");
  const [hits, setHits]   = useState<AthleteHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const data = await fetch(`/api/athletes/search?q=${encodeURIComponent(q.trim())}`).then(r => r.json()).catch(() => []);
      setHits((Array.isArray(data) ? data : []).filter((h: AthleteHit) => !exclude.includes(h.id)).slice(0, 8));
      setLoading(false);
    }, 220);
    return () => clearTimeout(t);
  }, [q, exclude]);

  return (
    <div className="cmp-overlay-backdrop" onClick={onClose}>
      <div className="cmp-overlay" onClick={e => e.stopPropagation()}>
        <div className="cmp-overlay-head">
          <span className="cmp-overlay-title">Legg til utøver</span>
          <button className="cmp-overlay-close" onClick={onClose}>✕</button>
        </div>
        <div className="cmp-overlay-body">
          <input className="cmp-overlay-input" placeholder="Søk navn…"
            value={q} onChange={e => setQ(e.target.value)} autoFocus />
          {loading && <div className="cmp-overlay-status">søker…</div>}
          {!loading && q.trim().length >= 2 && hits.length === 0 && (
            <div className="cmp-overlay-status">Ingen treff</div>
          )}
          {hits.map(h => (
            <button key={h.id} className="cmp-overlay-hit" onClick={() => onSelect(h)}>
              <div className="cmp-overlay-hit-name">{h.display_name}</div>
              <div className="cmp-overlay-hit-meta">{h.birth_year ? `Født ${h.birth_year}` : "Utøver"}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────────── */
export default function UtoverePage() {
  const [refreshing, setRefreshing]         = useState(false);
  const [q, setQ]                           = useState("");
  const [hits, setHits]                     = useState<AthleteHit[]>([]);
  const [loadingHits, setLoadingHits]       = useState(false);
  const [selected, setSelected]             = useState<AthleteHit | null>(null);
  const [results, setResults]               = useState<AthleteResultRow[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [filter, setFilter]                 = useState<DistanceCategory>("HM");
  const [ranks2026, setRanks2026]           = useState<Record<string, { rank: number; total: number } | null>>({});
  const [ranksLoading, setRanksLoading]     = useState(false);
  const [sortBy, setSortBy]                 = useState<"date" | "time">("date");
  const [sortDir, setSortDir]               = useState<"asc" | "desc">("desc");
  const [compareMode, setCompareMode]       = useState(false);
  const [compareAthletes, setCompareAthletes] = useState<AthleteData[]>([]);
  const [showAddOverlay, setShowAddOverlay] = useState(false);

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

  async function loadAthleteForCompare(hit: AthleteHit): Promise<AthleteData> {
    const cats = FILTERS.filter(f => f.key !== "OTHER").map(f => f.key);
    const [resultsData, ...rankResults] = await Promise.all([
      fetch(`/api/athletes/${hit.id}/results`, { cache: "no-store" }).then(r => r.json()),
      ...cats.map(cat =>
        fetch(`/api/rankings?athleteId=${encodeURIComponent(hit.id)}&category=${encodeURIComponent(cat)}&year=2026`, { cache: "no-store" })
          .then(r => r.json()).then(d => ({ cat, d })).catch(() => ({ cat, d: null }))
      ),
    ]);
    const ranks: Record<string, { rank: number; total: number } | null> = {};
    for (const { cat, d } of rankResults as { cat: string; d: any }[])
      ranks[cat] = d?.ok && Number.isFinite(d?.rank) ? { rank: d.rank, total: d.total } : null;
    return { hit, results: Array.isArray(resultsData) ? resultsData : [], ranks };
  }

  async function startCompare() {
    if (!selected) return;
    setCompareMode(true);
    const data = await loadAthleteForCompare(selected);
    setCompareAthletes([data]);
    setShowAddOverlay(true);
  }

  async function addToCompare(hit: AthleteHit) {
    setShowAddOverlay(false);
    const data = await loadAthleteForCompare(hit);
    setCompareAthletes(prev => prev.some(a => a.hit.id === hit.id) ? prev : [...prev, data]);
  }

  function removeFromCompare(id: string) {
    setCompareAthletes(prev => {
      const next = prev.filter(a => a.hit.id !== id);
      if (next.length === 0) setCompareMode(false);
      return next;
    });
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

  const filtered = useMemo(() => results.filter(r => (r.distance_category ?? "OTHER") === filter), [results, filter]);

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
    setCompareMode(false); setCompareAthletes([]);
  }

  if (compareMode) {
    return (
      <div className="cpn-root">
        <header className="cpn-header">
          <span className="cpn-logo">Løpsresultater</span>
          <span className="cpn-header-right">{new Date().getFullYear()} Season</span>
        </header>
        <CompareView athletes={compareAthletes} onRemove={removeFromCompare}
          onAddSearch={() => setShowAddOverlay(true)} onClose={() => { setCompareMode(false); setCompareAthletes([]); }} />
        {showAddOverlay && (
          <AddAthleteOverlay exclude={compareAthletes.map(a => a.hit.id)}
            onSelect={addToCompare} onClose={() => setShowAddOverlay(false)} />
        )}
      </div>
    );
  }

  return (
    <div className="cpn-root">
      <header className="cpn-header">
        <span className="cpn-logo">Løpsresultater</span>
        <span className="cpn-header-right">{new Date().getFullYear()} Season</span>
      </header>

      {!selected && (
        <>
          <div className="cpn-hero">
            <div>
              <div className="cpn-hero-eyebrow">Database · Søk · 2026 Sesong</div>
              <h1 className="cpn-hero-title">Utøver&shy;søk</h1>
            </div>
            <p className="cpn-hero-desc">Søk blant tusenvis av norske løpere. Se personlige rekorder, resultater og rangeringer for inneværende sesong.</p>
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
                <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--fg-3)" }}>Ingen treff.</span>
              </div>
            )}
          </div>
          <div className="cpn-home-sections">
            <TopLeaderboards year={2026} onSelectAthlete={loadResults} />
          </div>
        </>
      )}

      {selected && (
        <div className="ath-root">
          <div className="ath-hero">
            <div className="ath-hero-topbar">
              <button className="ath-back" onClick={handleBack}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Tilbake
              </button>
              <button className="ath-compare-btn" onClick={startCompare}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M4 2h6M4 7h6M4 12h6M1 2h.5M1 7h.5M1 12h.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Sammenlign
              </button>
            </div>

            <div className="ath-hero-inner">
              <div className="ath-identity">
                <div className="ath-initials">
                  {selected.display_name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()}
                </div>
                <div>
                  <h1 className="ath-name">{selected.display_name}</h1>
                  <p className="ath-meta">
                    {[selected.birth_year ? `Født ${selected.birth_year}${age ? ` · ${age} år` : ""}` : null, club].filter(Boolean).join("  ·  ")}
                    {refreshing && <span className="ath-refreshing"> · ⟳ oppdaterer</span>}
                  </p>
                  <div className="ath-dist-pills">
                    {prs.map(p => {
                      const r = ranks2026[p.cat];
                      return (
                        <button key={p.cat} className={`ath-dist-pill${filter === p.cat ? " active" : ""}`} onClick={() => setFilter(p.cat)}>
                          {FILTERS.find(f => f.key === p.cat)?.label}
                          {r && <span className="ath-pill-rank">#{r.rank}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              {prs.length > 0 && (
                <div className="ath-hero-pbs">
                  {prs.slice(0, 3).map(p => (
                    <button key={p.cat} className={`ath-hero-pb${filter === p.cat ? " active" : ""}`} onClick={() => setFilter(p.cat)}>
                      <span className="ath-hero-pb-dist">{FILTERS.find(f => f.key === p.cat)?.label}</span>
                      <span className="ath-hero-pb-time">{formatTime(p.best.time_ms)}</span>
                      <span className="ath-hero-pb-sub">PB · {p.count} løp</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {(Object.values(ranks2026).some(Boolean) || ranksLoading) && (
              <div className="ath-rank-stripe">
                <span className="ath-rank-stripe-label">2026 rangeringer</span>
                {ranksLoading && !Object.values(ranks2026).some(Boolean)
                  ? <span className="ath-rank-loading">henter…</span>
                  : FILTERS.filter(f => f.key !== "OTHER" && ranks2026[f.key] != null).map(f => {
                      const r = ranks2026[f.key]!;
                      return (
                        <button key={f.key} className={`ath-rank-chip${filter === f.key ? " active" : ""}`} onClick={() => setFilter(f.key)}>
                          <span className="ath-rank-chip-dist">{f.label}</span>
                          <span className="ath-rank-chip-rank">#{r.rank}</span>
                          <span className="ath-rank-chip-total">av {r.total.toLocaleString("nb-NO")}</span>
                        </button>
                      );
                    })
                }
              </div>
            )}
          </div>

          <div className="ath-tabs">
            {FILTERS.map(f => (
              <button key={f.key} className={`ath-tab${filter === f.key ? " active" : ""}`} onClick={() => setFilter(f.key)}>
                <span className="ath-tab-label">{f.label}</span>
                {byCategory.get(f.key)?.length ? <span className="ath-tab-count">{byCategory.get(f.key)!.length}</span> : null}
              </button>
            ))}
          </div>

          {trendStats.count > 0 && (
            <div className="ath-stats-zone">
              <div className="ath-pb-hero">
                <div className="ath-pb-eyebrow">Personlig rekord · {activeFilt.long}</div>
                <div className="ath-pb-big">{trendStats.best ? formatTime(trendStats.best.time_ms) : "—"}</div>
                {trendStats.best && (
                  <div className="ath-pb-context">
                    {pace(trendStats.best.time_ms, activeDM) && <span className="ath-pb-pace">{pace(trendStats.best.time_ms, activeDM)}</span>}
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

          {trendStats.count === 0 && (
            <div className="ath-no-dist">Ingen {activeFilt.long.toLowerCase()}-resultater registrert.</div>
          )}

          {sorted.length > 1 && (
            <div className="ath-chart-section">
              <div className="ath-section-label">Utvikling over tid</div>
              <TrendChart rows={sorted} />
            </div>
          )}

          {sorted.length > 0 && (
            <div className="ath-results-section">
              <div className="ath-results-head">
                <div className="ath-section-label" style={{ marginBottom: 0 }}>
                  {activeFilt.long}<span className="ath-results-count">{sorted.length} løp</span>
                </div>
                <div className="ath-sort-row">
                  {[{ key: "date", label: "Dato" }, { key: "time", label: "Tid" }].map(s => (
                    <button key={s.key} className={`ath-sort-btn${sortBy === s.key ? " active" : ""}`}
                      onClick={() => setSortBy(s.key as "date" | "time")}>{s.label}</button>
                  ))}
                  <button className="ath-sort-btn" onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}>
                    {sortDir === "asc" ? "↑" : "↓"}
                  </button>
                </div>
              </div>
              {loadingResults && <div className="ath-loading">Laster resultater…</div>}
              {!loadingResults && (
                <div className="ath-result-list">
                  {sorted.map((r, i) => {
                    const p       = pace(r.time_ms, activeDM);
                    const hasRank = r.rank_overall != null && r.total_finishers != null;
                    const isTop3  = (r.rank_overall ?? 999) <= 3;
                    const isTop3G = (r.rank_gender  ?? 999) <= 3;
                    const gTotal  = selected?.gender === "M" ? r.total_finishers_m : selected?.gender === "F" ? r.total_finishers_f : null;
                    const medal   = r.rank_overall === 1 ? "🥇" : r.rank_overall === 2 ? "🥈" : r.rank_overall === 3 ? "🥉" : null;
                    return (
                      <div key={i} className={`ath-result${isTop3 ? " ath-result--podium" : ""}`}>
                        <div className="ath-result-idx">
                          {isTop3 && medal ? <span className="ath-result-medal">{medal}</span> : <span className="ath-result-num">{i + 1}</span>}
                        </div>
                        <div className="ath-result-event">
                          <div className="ath-result-name">{r.event_name}</div>
                          <div className="ath-result-sub">
                            {r.race_name !== r.event_name && r.race_name + " · "}
                            {formatDate(r.start_date)}{r.club ? ` · ${r.club}` : ""}
                          </div>
                        </div>
                        {hasRank && (
                          <div className="ath-result-rank">
                            <div className="ath-result-rank-overall">
                              {r.rank_overall}<span className="ath-result-rank-denom">/{r.total_finishers?.toLocaleString("nb-NO")}</span>
                            </div>
                            {r.rank_gender != null && gTotal != null && (
                              <div className={`ath-result-rank-gender${isTop3G ? " top" : ""}`}>
                                {r.rank_gender}. {selected?.gender === "F" ? "dame" : "herre"}
                                <span className="ath-result-rank-denom"> /{gTotal.toLocaleString("nb-NO")}</span>
                              </div>
                            )}
                          </div>
                        )}
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