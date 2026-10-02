// Season statistics (leaderboards, Topp 100, national ranks).
//
// Computing these means scanning every result of a year, so they are cached in
// the Next.js data cache and shared by all visitors. After imports the cache is
// refreshed within SEASON_TTL, or right away via touchSeason().
import { revalidateTag, unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

export const SEASON_TAG = "season";
const SEASON_TTL = 1800; // seconds

export const SEASON_CATEGORIES = ["5K", "10K", "HM", "M"] as const;
export type SeasonCategory = (typeof SEASON_CATEGORIES)[number];

export function isSeasonCategory(v: string): v is SeasonCategory {
  return (SEASON_CATEGORIES as readonly string[]).includes(v);
}

function yearRange(year: number) {
  return { from: new Date(Date.UTC(year, 0, 1)), to: new Date(Date.UTC(year + 1, 0, 1)) };
}

/* ── Top lists ─────────────────────────────────────────────────────────── */

export type TopEntry = {
  athlete_id: string;
  display_name: string;
  birth_year: number | null;
  best_time_ms: number;
  rank: number;
  club: string | null;
  event_name: string | null;
  start_date: string | null;
};

type TopRow = {
  athlete_id: string;
  display_name: string;
  birth_year: number | null;
  best_time_ms: bigint;
  rank: bigint;
  club: string | null;
  event_name: string | null;
  start_date: Date | null;
};

async function loadTop(category: SeasonCategory, year: number, gender: "M" | "F", limit: number): Promise<TopEntry[]> {
  const { from, to } = yearRange(year);
  const rows = await prisma.$queryRaw<TopRow[]>`
    WITH best AS (
      SELECT DISTINCT ON (r.athlete_id)
        r.athlete_id,
        a.display_name,
        a.birth_year,
        r.time_ms AS best_time_ms,
        r.club,
        e.name AS event_name,
        e.start_date
      FROM results r
      JOIN races ra ON ra.id = r.race_id
      JOIN events e ON e.id = ra.event_id
      JOIN athletes a ON a.id = r.athlete_id
      WHERE r.distance_category = ${category}
        -- only fully imported events (profile-view history rows are partial fields)
        AND NOT (r.raw ? 'ArrangementUID')
        AND r.time_ms > 0
        AND e.start_date >= ${from}
        AND e.start_date < ${to}
        AND a.gender = ${gender}
      ORDER BY r.athlete_id, r.time_ms ASC
    ),
    ranked AS (
      SELECT *, DENSE_RANK() OVER (ORDER BY best_time_ms ASC) AS rank
      FROM best
    )
    SELECT athlete_id::text, display_name, birth_year, best_time_ms::bigint, rank, club, event_name, start_date
    FROM ranked
    WHERE rank <= ${limit}
    ORDER BY rank, display_name;
  `;
  return rows.map((r) => ({
    athlete_id: r.athlete_id,
    display_name: r.display_name,
    birth_year: r.birth_year,
    best_time_ms: Number(r.best_time_ms),
    rank: Number(r.rank),
    club: r.club,
    event_name: r.event_name,
    start_date: r.start_date ? r.start_date.toISOString().slice(0, 10) : null,
  }));
}

/** Top `limit` per gender (dense rank) for one distance and year. Cached. */
export const getTopList = unstable_cache(loadTop, ["season-top-v1"], { revalidate: SEASON_TTL, tags: [SEASON_TAG] });

export type Leaderboards = Record<SeasonCategory, { M: TopEntry[]; F: TopEntry[] }>;

/** Top 100 per gender, shared by Topp 100 and the leaderboards so both hit the same cache entry. */
export function getTop100(category: SeasonCategory, year: number, gender: "M" | "F") {
  return getTopList(category, year, gender, 100);
}

/** Top `limit` (dense rank) per gender for every distance — the front-page leaderboard. */
export async function getLeaderboards(year: number, limit = 5): Promise<Leaderboards> {
  const out = {} as Leaderboards;
  await Promise.all(
    SEASON_CATEGORIES.map(async (cat) => {
      const [M, F] = await Promise.all([getTop100(cat, year, "M"), getTop100(cat, year, "F")]);
      out[cat] = { M: M.filter((e) => e.rank <= limit), F: F.filter((e) => e.rank <= limit) };
    })
  );
  return out;
}

/* ── National ranks ────────────────────────────────────────────────────── */

/** Per distance: every distinct season-best time (sorted) and the number of ranked athletes. */
type SeasonTimes = Record<string, { times: number[]; total: number }>;

async function loadSeasonTimes(year: number): Promise<SeasonTimes> {
  const { from, to } = yearRange(year);
  // one pass over the year's results for all distances
  const rows = await prisma.$queryRaw<{ cat: string; best: number }[]>`
    SELECT r.distance_category AS cat, MIN(r.time_ms)::int AS best
    FROM results r
    JOIN races ra ON ra.id = r.race_id
    JOIN events e ON e.id = ra.event_id
    WHERE r.distance_category IN ('5K', '10K', 'HM', 'M')
      AND NOT (r.raw ? 'ArrangementUID')
      AND r.time_ms > 0
      AND e.start_date >= ${from}
      AND e.start_date < ${to}
    GROUP BY r.athlete_id, r.distance_category
  `;
  const acc: Record<string, { set: Set<number>; total: number }> = {};
  for (const r of rows) {
    const a = (acc[r.cat] ??= { set: new Set(), total: 0 });
    a.set.add(Number(r.best));
    a.total++;
  }
  const out: SeasonTimes = {};
  for (const [cat, a] of Object.entries(acc)) out[cat] = { times: [...a.set].sort((x, y) => x - y), total: a.total };
  return out;
}

const getSeasonTimes = unstable_cache(loadSeasonTimes, ["season-times-v1"], { revalidate: SEASON_TTL, tags: [SEASON_TAG] });

/** Number of entries in a sorted array that are strictly less than `v`. */
function countBelow(sorted: number[], v: number) {
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export type AthleteRanks = Record<SeasonCategory, { rank: number; total: number } | null>;

/**
 * The athlete's national rank per distance for `year` (dense rank on season best,
 * same rules as the top lists). Only the athlete's own results are queried; the
 * rest comes from the cached season table.
 */
export async function getAthleteRanks(athleteId: string, year: number): Promise<AthleteRanks> {
  const { from, to } = yearRange(year);
  const [mine, season] = await Promise.all([
    prisma.$queryRaw<{ cat: string; best: number }[]>`
      SELECT r.distance_category AS cat, MIN(r.time_ms)::int AS best
      FROM results r
      JOIN races ra ON ra.id = r.race_id
      JOIN events e ON e.id = ra.event_id
      WHERE r.athlete_id = ${athleteId}::uuid
        AND r.distance_category IN ('5K', '10K', 'HM', 'M')
        AND NOT (r.raw ? 'ArrangementUID')
        AND r.time_ms > 0
        AND e.start_date >= ${from}
        AND e.start_date < ${to}
      GROUP BY r.distance_category
    `,
    getSeasonTimes(year),
  ]);

  const out = Object.fromEntries(SEASON_CATEGORIES.map((c) => [c, null])) as AthleteRanks;
  for (const { cat, best } of mine) {
    const s = season[cat];
    if (!s || !isSeasonCategory(cat)) continue;
    // A result newer than the cached table still gets a sensible rank
    const below = countBelow(s.times, best);
    const known = s.times[below] === best;
    out[cat] = { rank: below + 1, total: known ? s.total : s.total + 1 };
  }
  return out;
}

/** Refresh season stats in the background (serves the old data meanwhile). */
export function touchSeason() {
  try {
    revalidateTag(SEASON_TAG, "max");
  } catch {
    // outside a request (scripts) — refreshes within SEASON_TTL anyway
  }
}
