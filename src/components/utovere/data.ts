// Client-side loaders shared by the athlete profile and the compare view.
import type { AthleteHit, AthleteResultRow } from "./types";
import { MAIN_DISTANCES } from "./utils";

export type Rank = { rank: number; total: number };
export type RankMap = Record<string, Rank | null>;

export async function fetchAthlete(id: string): Promise<AthleteHit | null> {
  try {
    const res = await fetch(`/api/athletes/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const a = await res.json();
    return a?.id ? a : null;
  } catch {
    return null;
  }
}

export async function fetchResults(id: string): Promise<AthleteResultRow[]> {
  try {
    const res = await fetch(`/api/athletes/${encodeURIComponent(id)}/results`, { cache: "no-store" });
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function fetchRanks(id: string, year: number): Promise<RankMap> {
  const entries = await Promise.all(
    MAIN_DISTANCES.map(async (d) => {
      try {
        const res = await fetch(
          `/api/rankings?athleteId=${encodeURIComponent(id)}&category=${d.key}&year=${year}`,
          { cache: "no-store" }
        );
        const j = await res.json();
        return [d.key, j?.ok && Number.isFinite(j?.rank) ? { rank: j.rank, total: j.total } : null] as const;
      } catch {
        return [d.key, null] as const;
      }
    })
  );
  return Object.fromEntries(entries);
}

/** Pulls the athlete's latest history from EQ Timing; resolves when done (errors ignored). */
export async function refreshFromSource(id: string) {
  try {
    await fetch(`/api/athletes/${encodeURIComponent(id)}/refresh-eqtiming`, { method: "POST" });
  } catch {
    // best effort
  }
}

export function bestByCategory(results: AthleteResultRow[]) {
  const map = new Map<string, AthleteResultRow>();
  for (const r of results) {
    const cat = r.distance_category ?? "OTHER";
    const cur = map.get(cat);
    if (!cur || r.time_ms < cur.time_ms) map.set(cat, r);
  }
  return map;
}

export function yearOf(r: AthleteResultRow) {
  return r.start_date ? Number(r.start_date.slice(0, 4)) : null;
}
