"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";

type DistCategory = "HM" | "5K" | "10K" | "M";
type SortKey = "fastest" | "latest" | "biggest";

interface RaceRow {
  id: string;
  name: string;
  location: string | null;
  latest_date: string | null;
  distance_category: string;
  finisher_count: number;
  avg_time_ms: number;
  avg_time_formatted: string;
  avg_time_m_ms: number | null;
  avg_time_m_formatted: string | null;
  avg_time_f_ms: number | null;
  avg_time_f_formatted: string | null;
  speed_rank: number;
  speed_rank_total: number;
  is_fastest: boolean;
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("nb-NO", { year: "numeric", month: "short" });
}

function SpeedBadge({ rank, total }: { rank: number; total: number }) {
  if (rank === 1)          return <span className="lop-badge lop-badge--gold">Raskest i Norge</span>;
  if (rank / total <= 0.2) return <span className="lop-badge lop-badge--fast">Rask bane</span>;
  if (rank / total >= 0.7) return <span className="lop-badge lop-badge--slow">Krevende rute</span>;
  return                          <span className="lop-badge lop-badge--avg">Gjennomsnittlig</span>;
}

const DIST_OPTS: { key: DistCategory; label: string }[] = [
  { key: "HM",  label: "Halvmaraton" },
  { key: "5K",  label: "5 km" },
  { key: "10K", label: "10 km" },
  { key: "M",   label: "Maraton" },
];
const SORT_OPTS: { key: SortKey; label: string }[] = [
  { key: "fastest", label: "Raskest" },
  { key: "latest",  label: "Siste" },
  { key: "biggest", label: "Størst" },
];

export default function LopPage() {
  const [races, setRaces]     = useState<RaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ]             = useState("");
  const [dist, setDist]       = useState<DistCategory>("HM");
  const [sort, setSort]       = useState<SortKey>("fastest");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/races?category=${dist}&sort=${sort}`)
      .then((r) => r.json())
      .then((d) => setRaces(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, [dist, sort]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return races;
    return races.filter(
      (r) =>
        r.name.toLowerCase().includes(term) ||
        (r.location ?? "").toLowerCase().includes(term)
    );
  }, [races, q]);

  return (
    <div className="lop-root">

      {/* ── HERO ── */}
      <div className="lop-hero">
        <div className="lop-hero-inner">
          <p className="lop-eyebrow">Løpsindeks · {new Date().getFullYear()}</p>
          <h1 className="lop-title">
            Hvilke løp er<br /><em>raskest?</em>
          </h1>
          <p className="lop-desc">
            Snitt finishtid per løp — kombinert fra alle år. Se hvem som er raskest og sammenlign menn og kvinner.
          </p>
          <div className="lop-search-row">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="lop-search-icon">
              <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              className="lop-search-input"
              placeholder="Søk løpsnavn eller by…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoComplete="off"
            />
            {q && <button className="lop-search-clear" onClick={() => setQ("")}>✕</button>}
          </div>
        </div>
      </div>

      {/* ── CONTROLS ── */}
      <div className="lop-controls">
        <div className="lop-dist-pills">
          {DIST_OPTS.map(({ key, label }) => (
            <button
              key={key}
              className={`lop-dist-pill${dist === key ? " active" : ""}`}
              onClick={() => setDist(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="lop-sort-row">
          <span className="lop-sort-label">Sorter</span>
          {SORT_OPTS.map(({ key, label }) => (
            <button
              key={key}
              className={`lop-sort-btn${sort === key ? " active" : ""}`}
              onClick={() => setSort(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── COLUMN HEADERS ── */}
      {!loading && filtered.length > 0 && (
        <div className="lop-table-head">
          <div className="lop-th-rank" />
          <div className="lop-th-name">Løp</div>
          <div className="lop-th-time">Snitt alle</div>
          <div className="lop-th-time lop-th-m">Snitt menn</div>
          <div className="lop-th-time lop-th-f">Snitt kvinner</div>
        </div>
      )}

      {/* ── LIST ── */}
      <div className="lop-list">
        {loading && <div className="lop-empty">Laster løp…</div>}

        {!loading && filtered.length === 0 && (
          <div className="lop-empty">
            {races.length === 0 ? "Ingen løp funnet for denne distansen." : `Ingen treff for "${q}".`}
          </div>
        )}

        {!loading && filtered.map((race, i) => (
          <Link
           key={`${race.id}-${race.name}-${i}`}
            href={`/lop/${race.id}?category=${dist}`}
            className={`lop-row${race.is_fastest ? " lop-row--fastest" : ""}`}
          >
            {/* rank */}
            <div className="lop-row-rank">
              {race.is_fastest ? (
                <div className="lop-rank-badge"><span className="lop-rank-badge-num">1</span></div>
              ) : (
                <span className="lop-rank-num">{i + 1}</span>
              )}
            </div>

            {/* name + meta */}
            <div className="lop-row-body">
              <div className="lop-row-name">{race.name}</div>
              <div className="lop-row-meta">
                {formatDate(race.latest_date)}
                {race.location ? ` · ${race.location}` : ""}
                {" · "}
                {race.finisher_count.toLocaleString("nb-NO")} fullf. totalt
              </div>
              <SpeedBadge rank={race.speed_rank} total={race.speed_rank_total} />
            </div>

            {/* avg all */}
            <div className="lop-row-right">
              <div className="lop-row-time">{race.avg_time_formatted}</div>
              <div className="lop-row-time-label">alle</div>
            </div>

            {/* avg men */}
            <div className="lop-row-right lop-col-m">
              <div className="lop-row-time lop-time-m">{race.avg_time_m_formatted ?? "—"}</div>
              <div className="lop-row-time-label">menn</div>
            </div>

            {/* avg women */}
            <div className="lop-row-right lop-col-f">
              <div className="lop-row-time lop-time-f">{race.avg_time_f_formatted ?? "—"}</div>
              <div className="lop-row-time-label">kvinner</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}