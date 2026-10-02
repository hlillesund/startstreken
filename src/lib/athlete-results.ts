// An athlete's full result history, as shown on the profile and compare pages.
import { revalidateTag, unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { AthleteResultRow } from "@/components/utovere/types";

const TTL = 600; // seconds

export function athleteTag(id: string) {
  return `athlete:${id}`;
}

type Row = {
  race_id: string;
  event_id: string;
  partial: boolean;
  race_name: string;
  event_name: string;
  start_date: Date | null;
  location: string | null;
  time_ms: number;
  distance_category: string | null;
  club: string | null;
  bib: string | null;
  rank_overall: number | null;
  rank_gender: number | null;
  total: bigint | null;
  total_m: bigint | null;
  total_f: bigint | null;
};

async function load(athleteId: string): Promise<AthleteResultRow[]> {
  // One round trip. Field counts are only computed for fully imported races:
  // results with an "ArrangementUID" in raw were pulled from EQ Timing for a
  // single athlete, so that race isn't in the DB and ranks would be "#1 of 1".
  const rows = await prisma.$queryRaw<Row[]>`
    WITH mine AS (
      SELECT r.race_id, r.time_ms, r.rank_overall, r.rank_gender, r.distance_category, r.club, r.bib,
             (r.raw ? 'ArrangementUID') AS partial
      FROM results r
      WHERE r.athlete_id = ${athleteId}::uuid AND r.time_ms > 0
    ),
    counts AS (
      SELECT r.race_id,
             COUNT(*)::bigint AS total,
             COUNT(*) FILTER (WHERE r.time_ms > 0 AND a.gender = 'M')::bigint AS total_m,
             COUNT(*) FILTER (WHERE r.time_ms > 0 AND a.gender = 'F')::bigint AS total_f
      FROM results r
      JOIN athletes a ON a.id = r.athlete_id
      WHERE r.race_id IN (SELECT race_id FROM mine WHERE NOT partial)
      GROUP BY r.race_id
    )
    SELECT m.race_id::text, e.id::text AS event_id, m.partial,
           ra.name AS race_name, e.name AS event_name, e.start_date, e.location,
           m.time_ms, m.distance_category, m.club, m.bib, m.rank_overall, m.rank_gender,
           c.total, c.total_m, c.total_f
    FROM mine m
    JOIN races ra ON ra.id = m.race_id
    JOIN events e ON e.id = ra.event_id
    LEFT JOIN counts c ON c.race_id = m.race_id
    ORDER BY e.start_date DESC NULLS LAST, m.time_ms ASC
  `;

  return rows.map((r) => {
    const full = !r.partial;
    return {
      race_id: r.race_id,
      event_id: r.event_id,
      full,
      race_name: r.race_name,
      event_name: r.event_name,
      start_date: r.start_date ? r.start_date.toISOString().split("T")[0] : null,
      location: r.location,
      time_ms: r.time_ms,
      distance_category: r.distance_category,
      club: r.club,
      bib: r.bib,
      rank_overall: full ? r.rank_overall : null,
      rank_gender: full ? r.rank_gender : null,
      total_finishers: full && r.total != null ? Number(r.total) : null,
      total_finishers_m: full && r.total_m != null ? Number(r.total_m) : null,
      total_finishers_f: full && r.total_f != null ? Number(r.total_f) : null,
    };
  });
}

/** Cached per athlete; call invalidateAthlete() when new results are stored for them. */
export function getAthleteResults(athleteId: string) {
  return unstable_cache(load, ["athlete-results-v1", athleteId], { revalidate: TTL, tags: [athleteTag(athleteId)] })(athleteId);
}

export function invalidateAthlete(athleteId: string) {
  try {
    revalidateTag(athleteTag(athleteId), { expire: 0 });
  } catch {
    // outside a request (scripts)
  }
}
