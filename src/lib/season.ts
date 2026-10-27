// Season statistics (leaderboards, Topp 100, national ranks).
//
// Computing these means scanning every result of a year, so they are cached in
// the Next.js data cache and shared by all visitors. After imports the cache is
// refreshed within SEASON_TTL, or right away via touchSeason().
import { revalidateTag, unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ageClassFor, birthRange } from "@/lib/age-class";
import { ensureFresh } from "@/lib/lop/snapshot";

export const SEASON_TAG = "season";
const SEASON_TTL = 6 * 3600; // seconds; refreshed sooner after imports (the snapshot rebuild revalidates the tag)

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

async function loadTop(
  category: SeasonCategory,
  year: number,
  gender: "M" | "F",
  limit: number,
  bornFrom: number | null = null,
  bornTo: number | null = null
): Promise<TopEntry[]> {
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
        AND (${bornFrom}::int IS NULL OR a.birth_year >= ${bornFrom}::int)
        AND (${bornTo}::int IS NULL OR a.birth_year <= ${bornTo}::int)
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

/** Top 100 within an age class (birth years `bornFrom`–`bornTo`). */
export function getTop100Class(category: SeasonCategory, year: number, gender: "M" | "F", bornFrom: number, bornTo: number) {
  return getTopList(category, year, gender, 100, bornFrom, bornTo);
}

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

/* ── National and age-class ranks ──────────────────────────────────────── */

export type ClassRank = { key: string; label: string; rank: number; total: number };
export type AthleteRanks = Record<SeasonCategory, { rank: number; total: number; cls?: ClassRank } | null>;

type RankRow = { cat: string; rank: number; total: number; self: boolean; c_rank: number | null; c_total: number | null; c_self: boolean | null };

/**
 * The athlete's national rank per distance for `year` (dense rank on season best,
 * same rules as the top lists) and competition rank within the age class.
 * Counted in the stored season bests (lib/season-store.ts); the athlete's own
 * best comes straight from the results, so a brand-new result still ranks.
 */
export async function getAthleteRanks(athleteId: string, year: number): Promise<AthleteRanks> {
  const { from, to } = yearRange(year);
  const [mine, who] = await Promise.all([
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
    prisma.athletes.findUnique({ where: { id: athleteId }, select: { gender: true, birth_year: true } }),
  ]);

  const out = Object.fromEntries(SEASON_CATEGORIES.map((c) => [c, null])) as AthleteRanks;
  const own = mine.filter((m) => isSeasonCategory(m.cat));
  if (own.length === 0) return out;

  await ensureFresh();
  const gender = who?.gender === "M" || who?.gender === "F" ? who.gender : null;
  const cls = gender && who?.birth_year ? ageClassFor(who.birth_year, gender, year) : null;
  const range = cls ? birthRange(cls, year) : null;

  const rows = await prisma.$queryRaw<RankRow[]>`
    WITH mine AS (SELECT * FROM unnest(${own.map((m) => m.cat)}::text[], ${own.map((m) => Number(m.best))}::int[]) AS t(cat, best))
    SELECT m.cat,
      (SELECT COUNT(DISTINCT s.best) FROM ss_private.season_best s WHERE s.year = ${year} AND s.cat = m.cat AND s.best < m.best)::int + 1 AS rank,
      (SELECT COUNT(*) FROM ss_private.season_best s WHERE s.year = ${year} AND s.cat = m.cat)::int AS total,
      EXISTS (SELECT 1 FROM ss_private.season_best s WHERE s.year = ${year} AND s.cat = m.cat AND s.athlete_id = ${athleteId}::uuid) AS self,
      CASE WHEN ${range ? 1 : 0}::int = 1 THEN (
        SELECT COUNT(*) FROM ss_private.season_best s
        WHERE s.year = ${year} AND s.cat = m.cat AND s.gender = ${gender} AND s.birth_year BETWEEN ${range?.from ?? 0}::int AND ${range?.to ?? 0}::int AND s.best < m.best
      )::int + 1 END AS c_rank,
      CASE WHEN ${range ? 1 : 0}::int = 1 THEN (
        SELECT COUNT(*) FROM ss_private.season_best s
        WHERE s.year = ${year} AND s.cat = m.cat AND s.gender = ${gender} AND s.birth_year BETWEEN ${range?.from ?? 0}::int AND ${range?.to ?? 0}::int
      )::int END AS c_total,
      CASE WHEN ${range ? 1 : 0}::int = 1 THEN EXISTS (
        SELECT 1 FROM ss_private.season_best s
        WHERE s.year = ${year} AND s.cat = m.cat AND s.athlete_id = ${athleteId}::uuid AND s.birth_year BETWEEN ${range?.from ?? 0}::int AND ${range?.to ?? 0}::int
      ) END AS c_self
    FROM mine m`;

  for (const r of rows) {
    if (!isSeasonCategory(r.cat) || r.total === 0) continue;
    const entry: NonNullable<AthleteRanks[SeasonCategory]> = { rank: r.rank, total: r.self ? r.total : r.total + 1 };
    if (cls && r.c_rank != null && r.c_total != null) {
      entry.cls = { key: cls.key, label: cls.label, rank: r.c_rank, total: r.c_self ? r.c_total : r.c_total + 1 };
    }
    out[r.cat] = entry;
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
