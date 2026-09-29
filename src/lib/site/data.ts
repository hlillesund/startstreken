import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CATS, type Cat } from "./format";

/*
 * Read-side queries for the public site. Rankings only use fully imported
 * events: rows added per athlete from EQ history (raw ? 'ArrangementUID') are a
 * partial field, and para results are stored with category OTHER.
 */

const FULL_EVENT = Prisma.sql`NOT (r.raw ? 'ArrangementUID')`;

function yearRange(year: number | null) {
  if (!year) return Prisma.empty;
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));
  return Prisma.sql`AND e.start_date >= ${from} AND e.start_date < ${to}`;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const num = (v: bigint | number | null | undefined) => (v == null ? null : Number(v));

/* ── Site stats ─────────────────────────────────────────────────────────── */

export async function getSiteStats() {
  const [row] = await prisma.$queryRaw<{ athletes: bigint; results: bigint; events: bigint }[]>`
    SELECT
      (SELECT count(*) FROM public.athletes) AS athletes,
      (SELECT count(*) FROM public.results) AS results,
      (SELECT count(DISTINCT ra.event_id) FROM public.races ra WHERE EXISTS (SELECT 1 FROM public.results x WHERE x.race_id = ra.id)) AS events`;
  return { athletes: Number(row.athletes), results: Number(row.results), events: Number(row.events) };
}

/* ── Rankings ───────────────────────────────────────────────────────────── */

export type RankRow = {
  rank: number;
  athleteId: string;
  name: string;
  gender: "M" | "F";
  birthYear: number | null;
  club: string | null;
  timeMs: number;
  eventId: string;
  eventName: string;
  date: string | null;
};

type RawRank = {
  cat: string;
  rk: bigint;
  athlete_id: string;
  display_name: string;
  gender: string;
  birth_year: number | null;
  club: string | null;
  time_ms: number;
  event_id: string;
  event_name: string;
  start_date: Date | null;
};

function toRankRow(r: RawRank): RankRow {
  return {
    rank: Number(r.rk),
    athleteId: r.athlete_id,
    name: r.display_name,
    gender: r.gender as "M" | "F",
    birthYear: r.birth_year,
    club: r.club,
    timeMs: r.time_ms,
    eventId: r.event_id,
    eventName: r.event_name,
    date: iso(r.start_date),
  };
}

/** Each athlete's best result per category (and where it was run). */
function bestCte(filters: Prisma.Sql) {
  return Prisma.sql`
    WITH best AS (
      SELECT DISTINCT ON (r.distance_category, r.athlete_id)
        r.distance_category AS cat, r.athlete_id, a.display_name, a.gender, a.birth_year, r.club,
        r.time_ms, e.id::text AS event_id, e.name AS event_name, e.start_date
      FROM public.results r
      JOIN public.races ra ON ra.id = r.race_id
      JOIN public.events e ON e.id = ra.event_id
      JOIN public.athletes a ON a.id = r.athlete_id
      WHERE ${FULL_EVENT} AND a.gender IN ('M', 'F') ${filters}
      ORDER BY r.distance_category, r.athlete_id, r.time_ms
    )`;
}

/** Top N men and women per category — for the front page. */
export async function getLeaderboards(year: number | null, limit = 5) {
  const rows = await prisma.$queryRaw<RawRank[]>`
    ${bestCte(Prisma.sql`AND r.distance_category IN (${Prisma.join(CATS)}) ${yearRange(year)}`)}
    SELECT * FROM (
      SELECT best.*, RANK() OVER (PARTITION BY cat, gender ORDER BY time_ms) AS rk FROM best
    ) t WHERE rk <= ${limit}
    ORDER BY cat, gender, rk`;
  const out = {} as Record<Cat, { M: RankRow[]; F: RankRow[] }>;
  for (const c of CATS) out[c] = { M: [], F: [] };
  for (const r of rows) out[r.cat as Cat]?.[r.gender as "M" | "F"].push(toRankRow(r));
  return out;
}

export async function getRanking(args: { cat: Cat; gender: "M" | "F"; year: number | null; limit: number; offset: number }) {
  const rows = await prisma.$queryRaw<(RawRank & { total: bigint })[]>`
    ${bestCte(Prisma.sql`AND r.distance_category = ${args.cat} AND a.gender = ${args.gender} ${yearRange(args.year)}`)}
    SELECT * FROM (
      SELECT best.*, RANK() OVER (ORDER BY time_ms) AS rk, count(*) OVER () AS total FROM best
    ) t
    ORDER BY rk, display_name
    LIMIT ${args.limit} OFFSET ${args.offset}`;
  return { rows: rows.map(toRankRow), total: rows.length ? Number(rows[0].total) : 0 };
}

/** The athlete's place in each category's ranking (within their gender). */
export async function getAthleteRanks(athleteId: string, gender: string | null, year: number | null) {
  if (gender !== "M" && gender !== "F") return {} as Partial<Record<Cat, { rank: number; total: number }>>;
  const rows = await prisma.$queryRaw<{ cat: string; rk: bigint; total: bigint }[]>`
    WITH best AS (
      SELECT r.distance_category AS cat, r.athlete_id, min(r.time_ms) AS t
      FROM public.results r
      JOIN public.races ra ON ra.id = r.race_id
      JOIN public.events e ON e.id = ra.event_id
      JOIN public.athletes a ON a.id = r.athlete_id
      WHERE ${FULL_EVENT} AND a.gender = ${gender}
        AND r.distance_category IN (${Prisma.join(CATS)}) ${yearRange(year)}
      GROUP BY 1, 2
    ), ranked AS (
      SELECT cat, athlete_id, RANK() OVER (PARTITION BY cat ORDER BY t) AS rk, count(*) OVER (PARTITION BY cat) AS total
      FROM best
    )
    SELECT cat, rk, total FROM ranked WHERE athlete_id = ${athleteId}::uuid`;
  const out: Partial<Record<Cat, { rank: number; total: number }>> = {};
  for (const r of rows) out[r.cat as Cat] = { rank: Number(r.rk), total: Number(r.total) };
  return out;
}

/* ── Search ─────────────────────────────────────────────────────────────── */

export type AthleteHit = {
  id: string;
  name: string;
  birthYear: number | null;
  gender: string | null;
  club: string | null;
  results: number;
};

export async function searchAthletes(q: string, limit = 12): Promise<AthleteHit[]> {
  const term = q.trim().toLowerCase().replace(/\s+/g, " ");
  if (term.length < 2) return [];
  const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const rows = await prisma.$queryRaw<
    { id: string; display_name: string; birth_year: number | null; gender: string | null; club: string | null; n: bigint }[]
  >`
    SELECT a.id::text, a.display_name, a.birth_year, a.gender, s.club, s.n
    FROM public.athletes a
    JOIN LATERAL (
      SELECT count(*) AS n,
             (SELECT x2.club FROM public.results x2 WHERE x2.athlete_id = a.id AND x2.club IS NOT NULL AND x2.club <> ''
              ORDER BY x2.created_at DESC LIMIT 1) AS club
      FROM public.results x WHERE x.athlete_id = a.id
    ) s ON s.n > 0
    WHERE a.display_name_norm ILIKE ${like} OR a.display_name_norm % ${term}
    ORDER BY (a.display_name_norm = ${term}) DESC,
             (a.display_name_norm LIKE ${`${term}%`}) DESC,
             similarity(a.display_name_norm, ${term}) DESC,
             s.n DESC
    LIMIT ${limit}`;
  return rows.map((r) => ({
    id: r.id,
    name: r.display_name,
    birthYear: r.birth_year,
    gender: r.gender,
    club: r.club,
    results: Number(r.n),
  }));
}

export type EventListItem = {
  id: string;
  name: string;
  date: string | null;
  location: string | null;
  results: number;
  cats: string[];
};

export async function listEvents(args: { q?: string; limit: number; offset?: number }): Promise<EventListItem[]> {
  const term = args.q?.trim();
  const like = term ? `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
  const rows = await prisma.$queryRaw<
    { id: string; name: string; start_date: Date | null; location: string | null; n: bigint; cats: string[] | null }[]
  >`
    SELECT e.id::text, e.name, e.start_date, e.location, s.n, s.cats
    FROM public.events e
    JOIN LATERAL (
      SELECT count(*) AS n,
             array_agg(DISTINCT r.distance_category) FILTER (WHERE r.distance_category IN (${Prisma.join(CATS)})) AS cats
      FROM public.races ra JOIN public.results r ON r.race_id = ra.id
      WHERE ra.event_id = e.id AND ${FULL_EVENT}
    ) s ON s.n > 0
    WHERE ${like ? Prisma.sql`(e.name ILIKE ${like} OR e.location ILIKE ${like})` : Prisma.sql`TRUE`}
    ORDER BY e.start_date DESC NULLS LAST, e.name
    LIMIT ${args.limit} OFFSET ${args.offset ?? 0}`;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    date: iso(r.start_date),
    location: r.location,
    results: Number(r.n),
    cats: (r.cats ?? []).filter(Boolean).sort((a, b) => CATS.indexOf(a as Cat) - CATS.indexOf(b as Cat)),
  }));
}

/* ── Athletes ───────────────────────────────────────────────────────────── */

export type Athlete = { id: string; name: string; birthYear: number | null; gender: string | null };

export async function getAthlete(id: string): Promise<Athlete | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const a = await prisma.athletes.findUnique({
    where: { id },
    select: { id: true, display_name: true, birth_year: true, gender: true },
  });
  return a ? { id: a.id, name: a.display_name, birthYear: a.birth_year, gender: a.gender } : null;
}

export type AthleteResult = {
  id: string;
  raceId: string;
  eventId: string;
  raceName: string;
  eventName: string;
  date: string | null;
  location: string | null;
  timeMs: number;
  cat: string;
  club: string | null;
  rank: number | null;
  rankGender: number | null;
  finishers: number | null;
  finishersGender: number | null;
  /** Only this athlete's result is known (added from their EQ history). */
  partial: boolean;
  para: boolean;
};

export async function getAthleteResults(athleteId: string, gender: string | null): Promise<AthleteResult[]> {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      race_id: string;
      event_id: string;
      race_name: string;
      event_name: string;
      start_date: Date | null;
      location: string | null;
      time_ms: number;
      cat: string | null;
      club: string | null;
      rank_overall: number | null;
      rank_gender: number | null;
      partial: boolean;
      para: boolean;
      finishers: bigint;
      finishers_gender: bigint | null;
    }[]
  >`
    SELECT x.id::text, ra.id::text AS race_id, e.id::text AS event_id, ra.name AS race_name, e.name AS event_name,
      e.start_date, e.location, x.time_ms, x.distance_category AS cat, x.club, x.rank_overall, x.rank_gender,
      (x.raw ? 'ArrangementUID') AS partial, coalesce((x.raw->>'para')::boolean, false) AS para,
      (SELECT count(*) FROM public.results y WHERE y.race_id = ra.id) AS finishers,
      (SELECT count(*) FROM public.results y JOIN public.athletes b ON b.id = y.athlete_id
        WHERE y.race_id = ra.id AND b.gender = ${gender ?? ""}) AS finishers_gender
    FROM public.results x
    JOIN public.races ra ON ra.id = x.race_id
    JOIN public.events e ON e.id = ra.event_id
    WHERE x.athlete_id = ${athleteId}::uuid AND x.time_ms > 0
    ORDER BY e.start_date DESC NULLS LAST, x.time_ms`;
  return rows.map((r) => ({
    id: r.id,
    raceId: r.race_id,
    eventId: r.event_id,
    raceName: r.race_name,
    eventName: r.event_name,
    date: iso(r.start_date),
    location: r.location,
    timeMs: r.time_ms,
    cat: r.cat ?? "OTHER",
    club: r.club,
    rank: r.partial ? null : r.rank_overall,
    rankGender: r.partial ? null : r.rank_gender,
    finishers: r.partial ? null : num(r.finishers),
    finishersGender: r.partial || !gender ? null : num(r.finishers_gender),
    partial: r.partial,
    para: r.para,
  }));
}

export type AthleteBundle = {
  athlete: Athlete;
  results: AthleteResult[];
  ranks: Partial<Record<Cat, { rank: number; total: number }>>;
  ranksAllTime: Partial<Record<Cat, { rank: number; total: number }>>;
};

export async function getAthleteBundle(id: string, year: number): Promise<AthleteBundle | null> {
  const athlete = await getAthlete(id);
  if (!athlete) return null;
  const [results, ranks, ranksAllTime] = await Promise.all([
    getAthleteResults(id, athlete.gender),
    getAthleteRanks(id, athlete.gender, year),
    getAthleteRanks(id, athlete.gender, null),
  ]);
  return { athlete, results, ranks, ranksAllTime };
}

/* ── Events & race results ──────────────────────────────────────────────── */

export type EventRace = { id: string; name: string; distanceM: number | null; cat: string; results: number };

export async function getEvent(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const event = await prisma.events.findUnique({
    where: { id },
    select: { id: true, name: true, start_date: true, location: true, series_id: true, sources: { select: { slug: true } } },
  });
  if (!event) return null;

  const races = await prisma.$queryRaw<{ id: string; name: string; distance_m: number | null; cat: string | null; n: bigint }[]>`
    SELECT ra.id::text, ra.name, ra.distance_m, mode() WITHIN GROUP (ORDER BY r.distance_category) AS cat, count(*) AS n
    FROM public.races ra JOIN public.results r ON r.race_id = ra.id
    WHERE ra.event_id = ${id}::uuid
    GROUP BY ra.id, ra.name, ra.distance_m
    ORDER BY count(*) DESC`;

  // Other editions: same series, or the same name without the year.
  const baseName = event.name.replace(/\b(19|20)\d{2}\b/g, "").replace(/\s+/g, " ").trim();
  const editions = await prisma.$queryRaw<{ id: string; name: string; start_date: Date | null }[]>`
    SELECT e.id::text, e.name, e.start_date FROM public.events e
    WHERE e.id <> ${id}::uuid
      AND (${event.series_id ? Prisma.sql`e.series_id = ${event.series_id}::uuid OR` : Prisma.empty}
           regexp_replace(regexp_replace(e.name, '\\m(19|20)[0-9]{2}\\M', '', 'g'), '\\s+', ' ', 'g') ILIKE ${baseName})
      AND EXISTS (SELECT 1 FROM public.races ra JOIN public.results r ON r.race_id = ra.id WHERE ra.event_id = e.id)
    ORDER BY e.start_date DESC NULLS LAST LIMIT 12`;

  return {
    id: event.id,
    name: event.name,
    date: iso(event.start_date),
    location: event.location,
    source: event.sources.slug,
    races: races.map((r) => ({ id: r.id, name: r.name, distanceM: r.distance_m, cat: r.cat ?? "OTHER", results: Number(r.n) })),
    editions: editions.map((e) => ({ id: e.id, name: e.name, date: iso(e.start_date) })),
  };
}

export type RaceResultRow = {
  rank: number | null;
  rankGender: number | null;
  athleteId: string;
  name: string;
  gender: string | null;
  birthYear: number | null;
  club: string | null;
  timeMs: number;
  para: boolean;
  partial: boolean;
};

export async function getRaceResults(args: { raceId: string; q?: string; gender?: string; offset: number; limit: number }) {
  const term = args.q?.trim().toLowerCase();
  const like = term ? `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
  const where = Prisma.sql`r.race_id = ${args.raceId}::uuid
    ${args.gender === "M" || args.gender === "F" ? Prisma.sql`AND a.gender = ${args.gender}` : Prisma.empty}
    ${like ? Prisma.sql`AND (a.display_name_norm ILIKE ${like} OR r.club ILIKE ${like})` : Prisma.empty}`;
  const [rows, [{ n }]] = await Promise.all([
    prisma.$queryRaw<
      {
        rank_overall: number | null;
        rank_gender: number | null;
        athlete_id: string;
        display_name: string;
        gender: string | null;
        birth_year: number | null;
        club: string | null;
        time_ms: number;
        para: boolean;
        partial: boolean;
      }[]
    >`
      SELECT r.rank_overall, r.rank_gender, a.id::text AS athlete_id, a.display_name, a.gender, a.birth_year, r.club, r.time_ms,
        coalesce((r.raw->>'para')::boolean, false) AS para, (r.raw ? 'ArrangementUID') AS partial
      FROM public.results r JOIN public.athletes a ON a.id = r.athlete_id
      WHERE ${where}
      ORDER BY r.time_ms, a.display_name
      LIMIT ${args.limit} OFFSET ${args.offset}`,
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM public.results r JOIN public.athletes a ON a.id = r.athlete_id WHERE ${where}`,
  ]);
  return {
    total: Number(n),
    rows: rows.map(
      (r): RaceResultRow => ({
        rank: r.rank_overall,
        rankGender: r.rank_gender,
        athleteId: r.athlete_id,
        name: r.display_name,
        gender: r.gender,
        birthYear: r.birth_year,
        club: r.club,
        timeMs: r.time_ms,
        para: r.para,
        partial: r.partial,
      })
    ),
  };
}
