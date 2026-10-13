// Derived numbers for the athlete profile. Pure functions over the results list.
import type { AthleteResultRow } from "./types";
import { MAIN_DISTANCES, distanceMeters } from "./utils";
import { yearOf } from "./data";

type R = AthleteResultRow;
const MAIN = new Set<string>(MAIN_DISTANCES.map((d) => d.key));

export function isMain(r: R) {
  return !!r.distance_category && MAIN.has(r.distance_category);
}

function fastest(rows: R[]) {
  return rows.reduce<R | null>((b, r) => (!b || r.time_ms < b.time_ms ? r : b), null);
}

/** Headline numbers for the whole career. */
export function careerSummary(results: R[], year: number) {
  const years = results.map(yearOf).filter((y): y is number => y != null);
  const km = results.filter(isMain).reduce((s, r) => s + (distanceMeters(r.distance_category) ?? 0), 0) / 1000;
  const podiums = results.filter((r) => r.rank_overall != null && r.rank_overall <= 3).length;
  const top10 = results.filter((r) => r.rank_overall != null && r.rank_overall <= 10).length;
  return {
    races: results.length,
    racesThisYear: results.filter((r) => yearOf(r) === year).length,
    km: Math.round(km),
    podiums,
    top10,
    firstYear: years.length ? Math.min(...years) : null,
    seasons: new Set(years).size,
  };
}

export type SeasonBest = { year: number; best: R; delta: number | null };

/** Best time per year for one distance, newest first, with change vs the previous season run. */
export function seasonBests(rows: R[]): SeasonBest[] {
  const by = new Map<number, R>();
  for (const r of rows) {
    const y = yearOf(r);
    if (y == null) continue;
    const cur = by.get(y);
    if (!cur || r.time_ms < cur.time_ms) by.set(y, r);
  }
  const asc = [...by.entries()].sort((a, b) => a[0] - b[0]);
  return asc
    .map(([year, best], i) => ({ year, best, delta: i > 0 ? best.time_ms - asc[i - 1][1].time_ms : null }))
    .reverse();
}

/** Share of the field beaten, as "top X %" (smaller is better). Needs a real field. */
export function topPercent(r: R) {
  if (r.rank_overall == null || !r.total_finishers || r.total_finishers < 10) return null;
  return (r.rank_overall / r.total_finishers) * 100;
}

export function formatTopPercent(p: number) {
  if (p < 1) return `topp ${Math.max(0.1, Math.ceil(p * 10) / 10).toLocaleString("nb-NO")} %`;
  return `topp ${Math.ceil(p)} %`;
}

/** Strip years and edition numbers so "Oslo Maraton 2025" and "Oslo Maraton 2026" group together. */
function raceKey(name: string) {
  return name.replace(/\b(19|20)\d{2}\b/g, "").replace(/\s+/g, " ").trim();
}

export function highlights(results: R[]) {
  // best placing relative to field size
  let bestPlace: { r: R; p: number } | null = null;
  for (const r of results) {
    const p = topPercent(r);
    if (p != null && (!bestPlace || p < bestPlace.p)) bestPlace = { r, p };
  }

  // favourite race (run at least twice)
  const counts = new Map<string, number>();
  for (const r of results) {
    const k = raceKey(r.event_name);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let favourite: { name: string; n: number } | null = null;
  for (const [name, n] of counts) if (n >= 2 && (!favourite || n > favourite.n)) favourite = { name, n };

  // fastest average pace on a standard distance
  let fastestPace: { r: R; secPerKm: number } | null = null;
  for (const r of results.filter(isMain)) {
    const m = distanceMeters(r.distance_category)!;
    const spk = r.time_ms / 1000 / (m / 1000);
    if (!fastestPace || spk < fastestPace.secPerKm) fastestPace = { r, secPerKm: spk };
  }

  // busiest season
  const perYear = new Map<number, number>();
  for (const r of results) {
    const y = yearOf(r);
    if (y != null) perYear.set(y, (perYear.get(y) ?? 0) + 1);
  }
  let busiest: { year: number; n: number } | null = null;
  for (const [year, n] of perYear) if (!busiest || n > busiest.n || (n === busiest.n && year > busiest.year)) busiest = { year, n };

  return { bestPlace, favourite, fastestPace, busiest };
}

/**
 * Riegel estimates (T2 = T1 · (D2/D1)^1.06) from the athlete's strongest record,
 * i.e. the PB that predicts the fastest marathon.
 */
export function predictions(results: R[]) {
  const pbs = MAIN_DISTANCES.map((d) => ({ d, pb: fastest(results.filter((r) => r.distance_category === d.key)) })).filter(
    (x): x is { d: (typeof MAIN_DISTANCES)[number]; pb: R } => x.pb != null
  );
  if (pbs.length === 0) return null;
  const riegel = (t: number, from: number, to: number) => t * Math.pow(to / from, 1.06);
  const base = pbs.reduce((b, x) => (riegel(x.pb.time_ms, x.d.meters, 42195) < riegel(b.pb.time_ms, b.d.meters, 42195) ? x : b));
  return {
    base,
    rows: MAIN_DISTANCES.map((d) => ({
      d,
      estimate: Math.round(riegel(base.pb.time_ms, base.d.meters, d.meters)),
      pb: pbs.find((x) => x.d.key === d.key)?.pb ?? null,
      isBase: d.key === base.d.key,
    })),
  };
}

/** Races per year for the last `span` years that have results (oldest first). */
export function racesPerYear(results: R[], span = 10) {
  const per = new Map<number, number>();
  for (const r of results) {
    const y = yearOf(r);
    if (y != null) per.set(y, (per.get(y) ?? 0) + 1);
  }
  if (per.size === 0) return [];
  const max = Math.max(...per.keys());
  const min = Math.max(Math.min(...per.keys()), max - span + 1);
  const out: { year: number; n: number }[] = [];
  for (let y = min; y <= max; y++) out.push({ year: y, n: per.get(y) ?? 0 });
  return out;
}

/** How the races split across distances. */
export function distanceMix(results: R[]) {
  const mix = [...MAIN_DISTANCES.map((d) => ({ key: d.key as string, label: d.label })), { key: "OTHER", label: "Annet" }].map((d) => ({
    ...d,
    n: results.filter((r) => (d.key === "OTHER" ? !isMain(r) : r.distance_category === d.key)).length,
  }));
  return mix.filter((m) => m.n > 0);
}
