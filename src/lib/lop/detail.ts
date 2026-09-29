import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { avgOf, courseKey, type LopEvent, type LopGroup, type LopIndex, type RaceStat } from "./index";

const FULL = Prisma.sql`r.time_ms > 0 AND NOT (r.raw ? 'ArrangementUID')`;

export type Person = { athleteId: string; name: string; gender: string | null; birthYear: number | null; club: string | null; timeMs: number };

/** (race, category) pairs as a table: stats only count results in the race's own category. */
function courseTable(races: RaceStat[]) {
  return Prisma.sql`unnest(${races.map((r) => r.id)}::uuid[], ${races.map((r) => r.cat)}::text[]) AS c(race_id, cat)`;
}

/* ── Race across the years ─────────────────────────────────────────────── */

export type EditionRow = {
  event: LopEvent;
  raceId: string;
  n: number;
  nM: number;
  nF: number;
  avg: number | null;
  avgM: number | null;
  avgF: number | null;
  winnerM: Person | null;
  winnerF: Person | null;
};

export async function getGroupCourse(index: LopIndex, group: LopGroup, key: string) {
  const perEvent = group.eventIds
    .map((id) => index.events[id])
    .map((ev) => ({ ev, races: ev.races.filter((r) => courseKey(r) === key) }))
    .filter((x) => x.races.length > 0);
  const races = perEvent.flatMap((x) => x.races);
  if (!races.length) return null;

  type Raw = { race_id: string; athlete_id: string; display_name: string; gender: string | null; birth_year: number | null; club: string | null; time_ms: number };
  const toPerson = (r: Raw): Person => ({
    athleteId: r.athlete_id,
    name: r.display_name,
    gender: r.gender,
    birthYear: r.birth_year,
    club: r.club,
    timeMs: r.time_ms,
  });

  const [winners, top, regulars] = await Promise.all([
    prisma.$queryRaw<Raw[]>`
      SELECT DISTINCT ON (r.race_id, a.gender)
        r.race_id::text, a.id::text AS athlete_id, a.display_name, a.gender, a.birth_year, r.club, r.time_ms
      FROM ${courseTable(races)}
      JOIN public.results r ON r.race_id = c.race_id AND r.distance_category = c.cat
      JOIN public.athletes a ON a.id = r.athlete_id
      WHERE ${FULL} AND a.gender IN ('M', 'F')
      ORDER BY r.race_id, a.gender, r.time_ms`,
    prisma.$queryRaw<(Raw & { event_id: string })[]>`
      WITH best AS (
        SELECT DISTINCT ON (r.athlete_id)
          r.race_id::text, a.id::text AS athlete_id, a.display_name, a.gender, a.birth_year, r.club, r.time_ms
        FROM ${courseTable(races)}
        JOIN public.results r ON r.race_id = c.race_id AND r.distance_category = c.cat
        JOIN public.athletes a ON a.id = r.athlete_id
        WHERE ${FULL} AND a.gender IN ('M', 'F')
        ORDER BY r.athlete_id, r.time_ms
      )
      SELECT * FROM (
        SELECT best.*, row_number() OVER (PARTITION BY gender ORDER BY time_ms, display_name) AS rn FROM best
      ) t WHERE rn <= 10
      ORDER BY gender, rn`,
    prisma.$queryRaw<{ athlete_id: string; display_name: string; gender: string | null; n: number; best: number }[]>`
      SELECT a.id::text AS athlete_id, a.display_name, a.gender, count(DISTINCT r.race_id)::int AS n, min(r.time_ms)::int AS best
      FROM ${courseTable(races)}
      JOIN public.results r ON r.race_id = c.race_id AND r.distance_category = c.cat
      JOIN public.athletes a ON a.id = r.athlete_id
      WHERE ${FULL}
      GROUP BY a.id
      HAVING count(DISTINCT r.race_id) > 1
      ORDER BY n DESC, best
      LIMIT 8`,
  ]);

  const raceEvent = new Map(races.map((r) => [r.id, r.eventId]));
  const eventOfRace = (id: string) => index.events[raceEvent.get(id)!];

  const winnerOf = new Map<string, { M: Person | null; F: Person | null }>();
  for (const w of winners) {
    const cur = winnerOf.get(w.race_id) ?? { M: null, F: null };
    if (w.gender === "M" || w.gender === "F") cur[w.gender] = toPerson(w);
    winnerOf.set(w.race_id, cur);
  }
  const faster = (a: Person | null, b: Person | null) => (!a ? b : !b ? a : b.timeMs < a.timeMs ? b : a);

  const editions: EditionRow[] = perEvent.map(({ ev, races: rs }) => {
    const sum = (f: (r: RaceStat) => number) => rs.reduce((t, r) => t + f(r), 0);
    const w = rs.map((r) => winnerOf.get(r.id));
    return {
      event: ev,
      raceId: rs[0].id,
      n: sum((r) => r.n),
      nM: sum((r) => r.nM),
      nF: sum((r) => r.nF),
      avg: avgOf(sum((r) => r.sum), sum((r) => r.n)),
      avgM: avgOf(sum((r) => r.sumM), sum((r) => r.nM)),
      avgF: avgOf(sum((r) => r.sumF), sum((r) => r.nF)),
      winnerM: w.reduce<Person | null>((b, x) => faster(b, x?.M ?? null), null),
      winnerF: w.reduce<Person | null>((b, x) => faster(b, x?.F ?? null), null),
    };
  });

  const topWith = (g: "M" | "F") =>
    top.filter((t) => t.gender === g).map((t) => ({ ...toPerson(t), event: eventOfRace(t.race_id) }));

  return {
    editions,
    topM: topWith("M"),
    topF: topWith("F"),
    regulars: regulars.map((r) => ({ athleteId: r.athlete_id, name: r.display_name, gender: r.gender, count: r.n, best: r.best })),
  };
}

/* ── One edition ───────────────────────────────────────────────────────── */

export type ResultRow = {
  rank: number | null;
  rankGender: number | null;
  athleteId: string;
  name: string;
  gender: string | null;
  birthYear: number | null;
  club: string | null;
  timeMs: number;
  para: boolean;
};

export type RaceSummary = {
  n: number;
  nM: number;
  nF: number;
  avg: number | null;
  avgM: number | null;
  avgF: number | null;
  median: number | null;
  best: number | null;
  times: number[];
  podiumM: Person[];
  podiumF: Person[];
};

export async function getRaceSummary(race: RaceStat): Promise<RaceSummary> {
  const [rows, podium] = await Promise.all([
    prisma.$queryRaw<{ time_ms: number; gender: string | null }[]>`
      SELECT r.time_ms, a.gender
      FROM public.results r JOIN public.athletes a ON a.id = r.athlete_id
      WHERE r.race_id = ${race.id}::uuid AND r.distance_category = ${race.cat} AND ${FULL}
      ORDER BY r.time_ms`,
    prisma.$queryRaw<{ athlete_id: string; display_name: string; gender: string; birth_year: number | null; club: string | null; time_ms: number }[]>`
      SELECT * FROM (
        SELECT a.id::text AS athlete_id, a.display_name, a.gender, a.birth_year, r.club, r.time_ms,
          row_number() OVER (PARTITION BY a.gender ORDER BY r.time_ms, a.display_name) AS rn
        FROM public.results r JOIN public.athletes a ON a.id = r.athlete_id
        WHERE r.race_id = ${race.id}::uuid AND r.distance_category = ${race.cat} AND ${FULL} AND a.gender IN ('M', 'F')
      ) t WHERE rn <= 3 ORDER BY gender, rn`,
  ]);
  const times = rows.map((r) => r.time_ms);
  const of = (g: string) => rows.filter((r) => r.gender === g).map((r) => r.time_ms);
  const mean = (a: number[]) => avgOf(a.reduce((t, x) => t + x, 0), a.length);
  const m = of("M"), f = of("F");
  const podiumOf = (g: string) =>
    podium
      .filter((p) => p.gender === g)
      .map((p) => ({ athleteId: p.athlete_id, name: p.display_name, gender: p.gender, birthYear: p.birth_year, club: p.club, timeMs: p.time_ms }));
  return {
    n: times.length,
    nM: m.length,
    nF: f.length,
    avg: mean(times),
    avgM: mean(m),
    avgF: mean(f),
    median: times.length ? times[Math.floor((times.length - 1) / 2)] : null,
    best: times[0] ?? null,
    times,
    podiumM: podiumOf("M"),
    podiumF: podiumOf("F"),
  };
}

export const PAGE_SIZE = 50;

export async function getRaceResults(args: { raceId: string; q?: string; gender?: "M" | "F" | null; page: number }) {
  const term = args.q?.trim().toLowerCase();
  const like = term ? `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
  const where = Prisma.sql`r.race_id = ${args.raceId}::uuid AND ${FULL}
    ${args.gender ? Prisma.sql`AND a.gender = ${args.gender}` : Prisma.empty}
    ${like ? Prisma.sql`AND (a.display_name_norm ILIKE ${like} OR a.display_name ILIKE ${like} OR r.club ILIKE ${like} OR r.bib = ${term})` : Prisma.empty}`;
  const [rows, [{ n }]] = await Promise.all([
    prisma.$queryRaw<
      { rank_overall: number | null; rank_gender: number | null; athlete_id: string; display_name: string; gender: string | null; birth_year: number | null; club: string | null; time_ms: number; para: boolean }[]
    >`
      SELECT r.rank_overall, r.rank_gender, a.id::text AS athlete_id, a.display_name, a.gender, a.birth_year, r.club, r.time_ms,
        coalesce((r.raw->>'para')::boolean, false) AS para
      FROM public.results r JOIN public.athletes a ON a.id = r.athlete_id
      WHERE ${where}
      ORDER BY r.time_ms, a.display_name, r.id
      LIMIT ${PAGE_SIZE} OFFSET ${(args.page - 1) * PAGE_SIZE}`,
    prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM public.results r JOIN public.athletes a ON a.id = r.athlete_id WHERE ${where}`,
  ]);
  return {
    total: n,
    rows: rows.map(
      (r): ResultRow => ({
        rank: r.rank_overall,
        rankGender: r.rank_gender,
        athleteId: r.athlete_id,
        name: r.display_name,
        gender: r.gender,
        birthYear: r.birth_year,
        club: r.club,
        timeMs: r.time_ms,
        para: r.para,
      })
    ),
  };
}

/** Which page of the unfiltered list an athlete is on. */
export async function pageOfAthlete(raceId: string, athleteId: string): Promise<number | null> {
  if (!/^[0-9a-f-]{36}$/i.test(athleteId)) return null;
  const [row] = await prisma.$queryRaw<{ rn: number }[]>`
    SELECT rn::int FROM (
      SELECT r.athlete_id, row_number() OVER (ORDER BY r.time_ms, a.display_name, r.id) AS rn
      FROM public.results r JOIN public.athletes a ON a.id = r.athlete_id
      WHERE r.race_id = ${raceId}::uuid AND ${FULL}
    ) t WHERE athlete_id = ${athleteId}::uuid LIMIT 1`;
  return row ? Math.ceil(row.rn / PAGE_SIZE) : null;
}
