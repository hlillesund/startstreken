// Clubs, as written on the results. Club names are free text, so they are
// grouped on a slug (lower case, runs of other characters → "-"), which also
// merges "IL Gneist", "Il  Gneist" and "IL-Gneist". Cached like the season stats.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { SEASON_TAG } from "@/lib/season";

const TTL = 1800;

/** Placeholders people type when they have no club. */
const NOT_CLUBS = ["ingen", "ingen-klubb", "uten-klubb", "ikke-medlem", "privat", "ukjent", "none", "no-club", "n-a", "na", "x", "mosjonist"];

function yearRange(year: number) {
  return { from: new Date(Date.UTC(year, 0, 1)), to: new Date(Date.UTC(year + 1, 0, 1)) };
}

export { clubSlug } from "@/lib/club-slug";

export type ClubRow = {
  slug: string;
  name: string;
  runners: number;
  results: number;
  /** Average of the club's three best season bests per distance (null with fewer than three). */
  top3: Record<string, number | null>;
};

type ClubSql = { slug: string; name: string; runners: number; results: number; t5: number | null; t10: number | null; thm: number | null; tm: number | null };

async function loadClubs(year: number): Promise<ClubRow[]> {
  const { from, to } = yearRange(year);
  const rows = await prisma.$queryRaw<ClubSql[]>`
    WITH c AS (
      SELECT
        trim(both '-' from regexp_replace(lower(btrim(r.club)), '[^a-z0-9æøåäöü]+', '-', 'g')) AS slug,
        btrim(r.club) AS name,
        r.athlete_id,
        r.distance_category AS cat,
        r.time_ms
      FROM results r
      JOIN races ra ON ra.id = r.race_id
      JOIN events e ON e.id = ra.event_id
      WHERE r.club IS NOT NULL
        AND NOT (r.raw ? 'ArrangementUID')
        AND r.time_ms > 0
        AND e.start_date >= ${from}
        AND e.start_date < ${to}
    ),
    clubs AS (
      SELECT slug, mode() WITHIN GROUP (ORDER BY name) AS name, COUNT(DISTINCT athlete_id)::int AS runners, COUNT(*)::int AS results
      FROM c
      WHERE slug <> '' AND NOT (slug = ANY(${NOT_CLUBS}))
      GROUP BY slug
      HAVING COUNT(DISTINCT athlete_id) >= 2
    ),
    best AS (
      SELECT slug, cat, athlete_id, MIN(time_ms) AS t
      FROM c
      WHERE cat IN ('5K', '10K', 'HM', 'M')
      GROUP BY slug, cat, athlete_id
    ),
    ranked AS (
      SELECT slug, cat, t, ROW_NUMBER() OVER (PARTITION BY slug, cat ORDER BY t) AS rn FROM best
    ),
    top3 AS (
      SELECT slug, cat, AVG(t)::int AS avg_t
      FROM ranked
      WHERE rn <= 3
      GROUP BY slug, cat
      HAVING COUNT(*) = 3
    )
    SELECT
      clubs.slug, clubs.name, clubs.runners, clubs.results,
      MAX(top3.avg_t) FILTER (WHERE top3.cat = '5K') AS t5,
      MAX(top3.avg_t) FILTER (WHERE top3.cat = '10K') AS t10,
      MAX(top3.avg_t) FILTER (WHERE top3.cat = 'HM') AS thm,
      MAX(top3.avg_t) FILTER (WHERE top3.cat = 'M') AS tm
    FROM clubs
    LEFT JOIN top3 ON top3.slug = clubs.slug
    GROUP BY clubs.slug, clubs.name, clubs.runners, clubs.results
    ORDER BY clubs.runners DESC, clubs.name
    LIMIT 600
  `;
  const n = (v: number | null) => (v == null ? null : Number(v));
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    runners: Number(r.runners),
    results: Number(r.results),
    top3: { "5K": n(r.t5), "10K": n(r.t10), HM: n(r.thm), M: n(r.tm) },
  }));
}

/** Clubs with at least two runners in `year`, most runners first. */
export const getClubs = unstable_cache(loadClubs, ["clubs-v1"], { revalidate: TTL, tags: [SEASON_TAG] });

/* ── One club ──────────────────────────────────────────────────────────── */

export type ClubMember = {
  athlete_id: string;
  display_name: string;
  gender: string | null;
  birth_year: number | null;
  races: number;
  /** Season best per distance, with where it was run. */
  best: Record<string, { t: number; event: string; date: string | null } | undefined>;
};

export type ClubResult = {
  athlete_id: string;
  display_name: string;
  event_id: string;
  race_id: string;
  event_name: string;
  race_name: string;
  date: string | null;
  cat: string | null;
  time_ms: number;
  rank_overall: number | null;
};

export type ClubDetail = {
  slug: string;
  name: string;
  year: number;
  races: number;
  members: ClubMember[];
  recent: ClubResult[];
};

type DetailSql = {
  athlete_id: string;
  display_name: string;
  gender: string | null;
  birth_year: number | null;
  club: string;
  event_id: string;
  race_id: string;
  event_name: string;
  race_name: string;
  start_date: Date | null;
  cat: string | null;
  time_ms: number;
  rank_overall: number | null;
};

async function loadClub(slug: string, year: number): Promise<ClubDetail | null> {
  const { from, to } = yearRange(year);
  const rows = await prisma.$queryRaw<DetailSql[]>`
    SELECT
      a.id::text AS athlete_id, a.display_name, a.gender, a.birth_year,
      btrim(r.club) AS club,
      e.id::text AS event_id, ra.id::text AS race_id, e.name AS event_name, ra.name AS race_name, e.start_date,
      r.distance_category AS cat, r.time_ms, r.rank_overall
    FROM results r
    JOIN races ra ON ra.id = r.race_id
    JOIN events e ON e.id = ra.event_id
    JOIN athletes a ON a.id = r.athlete_id
    WHERE r.club IS NOT NULL
      AND trim(both '-' from regexp_replace(lower(btrim(r.club)), '[^a-z0-9æøåäöü]+', '-', 'g')) = ${slug}
      AND NOT (r.raw ? 'ArrangementUID')
      AND r.time_ms > 0
      AND e.start_date >= ${from}
      AND e.start_date < ${to}
    ORDER BY e.start_date DESC, r.time_ms ASC
  `;
  if (rows.length === 0) return null;

  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  const names = new Map<string, number>();
  const events = new Set<string>();
  const members = new Map<string, ClubMember>();
  for (const r of rows) {
    names.set(r.club, (names.get(r.club) ?? 0) + 1);
    events.add(r.event_id);
    let m = members.get(r.athlete_id);
    if (!m) {
      m = { athlete_id: r.athlete_id, display_name: r.display_name, gender: r.gender, birth_year: r.birth_year, races: 0, best: {} };
      members.set(r.athlete_id, m);
    }
    m.races++;
    const t = Number(r.time_ms);
    if (r.cat && (!m.best[r.cat] || t < m.best[r.cat]!.t)) m.best[r.cat] = { t, event: r.event_name, date: iso(r.start_date) };
  }

  return {
    slug,
    name: [...names.entries()].sort((a, b) => b[1] - a[1])[0][0],
    year,
    races: events.size,
    members: [...members.values()].sort((a, b) => b.races - a.races || a.display_name.localeCompare(b.display_name, "nb")),
    recent: rows.slice(0, 12).map((r) => ({
      athlete_id: r.athlete_id,
      display_name: r.display_name,
      event_id: r.event_id,
      race_id: r.race_id,
      event_name: r.event_name,
      race_name: r.race_name,
      date: iso(r.start_date),
      cat: r.cat,
      time_ms: Number(r.time_ms),
      rank_overall: r.rank_overall,
    })),
  };
}

/** Everything the club page shows for one season. */
export const getClub = unstable_cache(loadClub, ["club-v1"], { revalidate: TTL, tags: [SEASON_TAG] });
