"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

interface YearRow {
  year: number | null;
  finisher_count: number;
  finisher_count_m: number;
  finisher_count_f: number;
  avg_time_ms: number;
  avg_time_formatted: string;
  avg_time_m_ms: number | null;
  avg_time_m_formatted: string;
  avg_time_f_ms: number | null;
  avg_time_f_formatted: string;
  delta_ms: number | null;
}

interface DistBucket {
  label: string;
  count: number;
  count_m: number;
  count_f: number;
  pct: number;
}

interface Finisher {
  athlete_id: string;
  display_name: string;
  club: string;
  time_ms: number;
  time_formatted: string;
  rank: number;
}

interface CompRace {
  name: string;
  avg_time_ms: number;
  avg_time_formatted: string;
  is_this: boolean;
}

interface RaceDetail {
  id: string;
  name: string;
  location: string | null;
  distance_category: string;
  edition_count: number;
  finisher_count: number;
  finisher_count_m: number;
  finisher_count_f: number;
  avg_time_ms: number;
  avg_time_formatted: string;
  avg_time_m_ms: number | null;
  avg_time_m_formatted: string;
  avg_time_f_ms: number | null;
  avg_time_f_formatted: string;
  avg_pace_formatted: string;
  course_record_ms: number;
  course_record_formatted: string;
  course_record_athlete: string;
  yearly: YearRow[];
  distribution: DistBucket[];
  top_finishers_m: Finisher[];
  top_finishers_f: Finisher[];
  comparable_races: CompRace[];
}

const DIST_LABEL: Record<string, string> = {
  "5K": "5 km", "10K": "10 km", HM: "Halvmaraton", M: "Maraton",
};

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="lopd-delta lopd-delta--neutral">–</span>;
  const abs = Math.abs(delta);
  const s = Math.round(abs / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const fmt = m > 0 ? `${m}:${String(sec).padStart(2, "0")}` : `${sec}s`;
  if (delta < 0) return <span className="lopd-delta lopd-delta--faster">↑ {fmt} raskere</span>;
  return <span className="lopd-delta lopd-delta--slower">↓ {fmt} tregere</span>;
}

export default function RaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const category = searchParams.get("category") ?? "HM";

  const [race, setRace]       = useState<RaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  // Which year is expanded in the yearly table (null = none)
  const [expandedYear, setExpandedYear] = useState<number | null>(null);
  // Gender tab for top finishers
  const [finisherGender, setFinisherGender] = useState<"M" | "F">("M");
  // Gender overlay for distribution chart
  const [distGender, setDistGender] = useState<"all" | "M" | "F">("all");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(false);
    fetch(`/api/races/${id}?category=${category}`)
      .then((r) => r.json())
      .then((d) => { if (d?.ok) setRace(d.race); else setError(true); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id, category]);

  if (loading) return <div className="lopd-root"><p className="lopd-loading">Laster…</p></div>;
  if (error || !race) return <div className="lopd-root"><p className="lopd-loading">Løpet ble ikke funnet.</p></div>;

  const maxComp = Math.max(...race.comparable_races.map((r) => r.avg_time_ms), 1);

  // Distribution chart values depend on selected gender
  const distCounts = race.distribution.map((b) =>
    distGender === "M" ? b.count_m : distGender === "F" ? b.count_f : b.count
  );
  const maxDist = Math.max(...distCounts, 1);

  const finishers = finisherGender === "M" ? race.top_finishers_m : race.top_finishers_f;

  return (
    <div className="lopd-root">

      {/* ── HERO ── */}
      <div className="lopd-hero">
        <button className="lopd-back" onClick={() => router.back()}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Alle løp
        </button>
        <span className="lopd-dist-badge">{DIST_LABEL[race.distance_category] ?? race.distance_category}</span>
        <h1 className="lopd-name">{race.name}</h1>
        <p className="lopd-sub">
          {race.edition_count} utgaver registrert
          {race.location ? ` · ${race.location}` : ""}
          {" · "}
          {race.finisher_count.toLocaleString("nb-NO")} finishtider totalt
        </p>
      </div>

      {/* ── ALL-TIME STAT BAND ── */}
      <div className="lopd-statband">
        <div className="lopd-stat lopd-stat--hero">
          <div className="lopd-stat-label">Snitt alle</div>
          <div className="lopd-stat-val">{race.avg_time_formatted}</div>
          <div className="lopd-stat-hint">{race.avg_pace_formatted}</div>
        </div>
        <div className="lopd-stat lopd-stat--men">
          <div className="lopd-stat-label">Snitt menn</div>
          <div className="lopd-stat-val">{race.avg_time_m_formatted}</div>
          <div className="lopd-stat-hint">{race.finisher_count_m.toLocaleString("nb-NO")} herrer</div>
        </div>
        <div className="lopd-stat lopd-stat--women">
          <div className="lopd-stat-label">Snitt kvinner</div>
          <div className="lopd-stat-val">{race.avg_time_f_formatted}</div>
          <div className="lopd-stat-hint">{race.finisher_count_f.toLocaleString("nb-NO")} damer</div>
        </div>
        <div className="lopd-stat">
          <div className="lopd-stat-label">Løyperekord</div>
          <div className="lopd-stat-val">{race.course_record_formatted}</div>
          <div className="lopd-stat-hint">{race.course_record_athlete}</div>
        </div>
      </div>

      {/* ── COMPARISON ── */}
      {race.comparable_races.length > 0 && (
        <div className="lopd-section">
          <div className="lopd-section-label">Sammenlignet med andre løp · snitt alle</div>
          <div className="lopd-compare">
            {race.comparable_races.map((cr) => (
              <div key={cr.name} className={`lopd-cmp-row${cr.is_this ? " lopd-cmp-row--this" : ""}`}>
                <div className="lopd-cmp-name">{cr.name}</div>
                <div className="lopd-cmp-bar-wrap">
                  <div
                    className={`lopd-cmp-bar${cr.is_this ? " lopd-cmp-bar--this" : ""}`}
                    style={{ width: `${Math.round((cr.avg_time_ms / maxComp) * 100)}%` }}
                  />
                </div>
                <div className="lopd-cmp-time">{cr.avg_time_formatted}</div>
              </div>
            ))}
          </div>
          <p className="lopd-compare-note">Kortere søyle = raskere snitt.</p>
        </div>
      )}

      {/* ── YEAR BY YEAR ── */}
      {race.yearly.length > 0 && (
        <div className="lopd-section lopd-section--alt">
          <div className="lopd-section-label">Snitt finishtid per år</div>

          {/* column headers */}
          <div className="lopd-yr-head">
            <span className="lopd-yr-head-year">År</span>
            <span className="lopd-yr-head-col">Alle</span>
            <span className="lopd-yr-head-col lopd-yr-head-m">Menn</span>
            <span className="lopd-yr-head-col lopd-yr-head-f">Kvinner</span>
            <span className="lopd-yr-head-trend">Trend</span>
          </div>

          <div className="lopd-yearly">
            {race.yearly.map((y) => (
              <div key={y.year}>
                <div
                  className={`lopd-yr-row lopd-yr-row--clickable${expandedYear === y.year ? " lopd-yr-row--open" : ""}`}
                  onClick={() => setExpandedYear(expandedYear === y.year ? null : y.year)}
                >
                  <span className="lopd-yr-year">{y.year ?? "—"}</span>
                  <div className="lopd-yr-cols">
                    <span className="lopd-yr-time">{y.avg_time_formatted}</span>
                    <span className="lopd-yr-time lopd-yr-time-m">{y.avg_time_m_formatted || "—"}</span>
                    <span className="lopd-yr-time lopd-yr-time-f">{y.avg_time_f_formatted || "—"}</span>
                  </div>
                  <DeltaBadge delta={y.delta_ms} />
                  <span className="lopd-yr-chevron">{expandedYear === y.year ? "▲" : "▼"}</span>
                </div>
                {expandedYear === y.year && (
                  <div className="lopd-yr-detail">
                    <div className="lopd-yr-detail-row">
                      <span>Alle finishers</span>
                      <span>{y.finisher_count.toLocaleString("nb-NO")}</span>
                    </div>
                    <div className="lopd-yr-detail-row">
                      <span>Herrer</span>
                      <span>{y.finisher_count_m.toLocaleString("nb-NO")} · {y.avg_time_m_formatted}</span>
                    </div>
                    <div className="lopd-yr-detail-row">
                      <span>Damer</span>
                      <span>{y.finisher_count_f.toLocaleString("nb-NO")} · {y.avg_time_f_formatted}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── DISTRIBUTION ── */}
      {race.distribution.length > 0 && (
        <div className="lopd-section">
          <div className="lopd-top-head">
            <div className="lopd-section-label" style={{ marginBottom: 0 }}>
              Finishtider fordelt
            </div>
            <div className="lopd-gender-toggle">
              {(["all", "M", "F"] as const).map((g) => (
                <button
                  key={g}
                  className={`lopd-gender-btn${distGender === g ? " active" : ""}`}
                  onClick={() => setDistGender(g)}
                >
                  {g === "all" ? "Alle" : g === "M" ? "Menn" : "Kvinner"}
                </button>
              ))}
            </div>
          </div>
          <div className="lopd-dist-chart" style={{ marginTop: 16 }}>
            {race.distribution.map((b, i) => {
              const count = distCounts[i];
              const h = Math.max(count > 0 ? Math.round((count / maxDist) * 100) : 0, count > 0 ? 4 : 0);
              const isPeak = count === maxDist && count > 0;
              return (
                <div key={b.label} className="lopd-dc-col">
                  <div className="lopd-dc-count">{count > 0 ? count.toLocaleString("nb-NO") : ""}</div>
                  <div className={`lopd-dc-bar${isPeak ? " lopd-dc-bar--peak" : ""}`} style={{ height: `${h}%` }} />
                  <div className={`lopd-dc-lbl${isPeak ? " lopd-dc-lbl--peak" : ""}`}>{b.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TOP FINISHERS ── */}
      {(race.top_finishers_m.length > 0 || race.top_finishers_f.length > 0) && (
        <div className="lopd-section lopd-section--alt lopd-section--last">
          <div className="lopd-top-head">
            <div className="lopd-section-label" style={{ marginBottom: 0 }}>
              Raskeste finishers · alle år
            </div>
            <div className="lopd-gender-toggle">
              <button
                className={`lopd-gender-btn${finisherGender === "M" ? " active" : ""}`}
                onClick={() => setFinisherGender("M")}
              >
                Herrer
              </button>
              <button
                className={`lopd-gender-btn${finisherGender === "F" ? " active" : ""}`}
                onClick={() => setFinisherGender("F")}
              >
                Damer
              </button>
            </div>
          </div>

          <div className="lopd-finishers">
            {finishers.map((f, i) => (
              <Link
                key={f.athlete_id}
                href={`/utovere?athleteId=${f.athlete_id}`}
                className={`lopd-fin-row${i === 0 ? " lopd-fin-row--first" : ""}`}
              >
                <div className="lopd-fin-num">
                  {i === 0 ? (
                    <div className="lopd-fin-badge"><span className="lopd-fin-badge-n">1</span></div>
                  ) : (
                    <span className="lopd-fin-rank">{i + 1}</span>
                  )}
                </div>
                <div className="lopd-fin-info">
                  <div className="lopd-fin-name">{f.display_name}</div>
                  {f.club && <div className="lopd-fin-meta">{f.club}</div>}
                </div>
                <div className="lopd-fin-time">{f.time_formatted}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}