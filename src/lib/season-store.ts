// Season bests stored in the database, so ranks and «Hvor havner jeg?» are small
// indexed counts instead of big lists in the data cache (each several hundred KB,
// rewritten on every refresh). Refreshed together with the race index snapshot
// (see lib/lop/snapshot.ts), i.e. in the background after imports.
//   ss_private.season_best       one row per athlete, distance and year
//   ss_private.season_big_races  the six biggest races per distance and year
import { prisma } from "@/lib/prisma";

const YEARS_BACK = 2; // this season and the two before (what the pages offer)

let tables: Promise<void> | null = null;

export function ensureSeasonTables() {
  tables ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS ss_private`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ss_private.season_best (
        year       int  NOT NULL,
        cat        text NOT NULL,
        athlete_id uuid NOT NULL,
        best       int  NOT NULL,
        gender     text,
        birth_year int,
        PRIMARY KEY (year, cat, athlete_id)
      )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS season_best_time_idx ON ss_private.season_best (year, cat, best)`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS season_best_class_idx ON ss_private.season_best (year, cat, gender, birth_year)`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ss_private.season_big_races (
        year     int  NOT NULL,
        cat      text NOT NULL,
        pos      int  NOT NULL,
        race_id  uuid NOT NULL,
        event_id uuid NOT NULL,
        name     text NOT NULL,
        date     date,
        location text,
        finishers int NOT NULL,
        PRIMARY KEY (year, cat, pos)
      )`);
  })().catch((e) => {
    tables = null;
    throw e;
  });
  return tables;
}

/** Recomputes the stored season bests and biggest races (a few aggregate queries). */
export async function refreshSeasonStore() {
  await ensureSeasonTables();
  const now = new Date().getUTCFullYear();
  const from = new Date(Date.UTC(now - YEARS_BACK, 0, 1));
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`TRUNCATE ss_private.season_best, ss_private.season_big_races`);
      await tx.$executeRaw`
        INSERT INTO ss_private.season_best (year, cat, athlete_id, best, gender, birth_year)
        SELECT extract(year FROM e.start_date)::int, r.distance_category, r.athlete_id, MIN(r.time_ms), a.gender, a.birth_year
        FROM results r
        JOIN races ra ON ra.id = r.race_id
        JOIN events e ON e.id = ra.event_id
        JOIN athletes a ON a.id = r.athlete_id
        WHERE r.distance_category IN ('5K', '10K', 'HM', 'M')
          AND NOT (r.raw ? 'ArrangementUID')
          AND r.time_ms > 0
          AND e.start_date >= ${from}
        GROUP BY 1, 2, 3, a.gender, a.birth_year`;
      await tx.$executeRaw`
        INSERT INTO ss_private.season_big_races (year, cat, pos, race_id, event_id, name, date, location, finishers)
        SELECT year, cat, pos, race_id, event_id, name, date, location, n FROM (
          SELECT extract(year FROM e.start_date)::int AS year, r.distance_category AS cat, ra.id AS race_id, e.id AS event_id,
                 e.name, e.start_date AS date, e.location, COUNT(*)::int AS n,
                 ROW_NUMBER() OVER (PARTITION BY extract(year FROM e.start_date), r.distance_category ORDER BY COUNT(*) DESC) AS pos
          FROM results r
          JOIN races ra ON ra.id = r.race_id
          JOIN events e ON e.id = ra.event_id
          WHERE r.distance_category IN ('5K', '10K', 'HM', 'M')
            AND NOT (r.raw ? 'ArrangementUID')
            AND r.time_ms > 0
            AND e.start_date >= ${from}
          GROUP BY 1, 2, 3, 4, 5, 6, 7
        ) t WHERE pos <= 6`;
    },
    { timeout: 120_000, maxWait: 15_000 }
  );
}
