// Client-side loaders shared by the athlete profile and the compare view.
import type { AthleteHit, AthleteResultRow } from "./types";

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
    const res = await fetch(`/api/athletes/${encodeURIComponent(id)}/results`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function fetchRanks(id: string, year: number): Promise<RankMap> {
  try {
    const res = await fetch(`/api/athletes/${encodeURIComponent(id)}/ranks?year=${year}`);
    const j = await res.json();
    return j?.ok && j.ranks ? j.ranks : {};
  } catch {
    return {};
  }
}

/**
 * Pulls the athlete's latest history from EQ Timing (errors ignored).
 * Resolves to true when new results were stored, i.e. the profile should reload.
 */
export async function refreshFromSource(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/athletes/${encodeURIComponent(id)}/refresh-eqtiming`, { method: "POST" });
    const j = await res.json().catch(() => null);
    return Number(j?.inserted) > 0;
  } catch {
    return false;
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
