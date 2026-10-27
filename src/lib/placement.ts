// «Hvor havner jeg?»: where a given time places in this season's field.
// Counted in the stored season bests and biggest races (lib/season-store.ts),
// so each request is a few small indexed queries and nothing large is cached.
import { prisma } from "@/lib/prisma";
import type { SeasonCategory } from "@/lib/season";
import { ageClassFor, birthRange } from "@/lib/age-class";
import { ensureFresh } from "@/lib/lop/snapshot";

export type Placement = {
  year: number;
  national: { rank: number; total: number; beaten: number; histogram: number[]; bin: number; min: number; max: number; marks: { p: number; t: number }[] } | null;
  ageClass: { label: string; rank: number; total: number; beaten: number } | null;
  races: { event_id: string; race_id: string; name: string; date: string | null; location: string | null; rank: number; total: number }[];
};

const BINS = 28;

type FieldStats = { n: number; faster: number; p01: number | null; p10: number | null; p25: number | null; p50: number | null; p99: number | null };

async function fieldStats(cat: SeasonCategory, year: number, gender: "M" | "F" | "A", timeMs: number): Promise<FieldStats> {
  const [row] = await prisma.$queryRaw<FieldStats[]>`
    SELECT COUNT(*)::int AS n,
      COUNT(*) FILTER (WHERE best < ${timeMs})::int AS faster,
      percentile_disc(0.01) WITHIN GROUP (ORDER BY best) AS p01,
      percentile_disc(0.10) WITHIN GROUP (ORDER BY best) AS p10,
      percentile_disc(0.25) WITHIN GROUP (ORDER BY best) AS p25,
      percentile_disc(0.50) WITHIN GROUP (ORDER BY best) AS p50,
      percentile_disc(0.99) WITHIN GROUP (ORDER BY best) AS p99
    FROM ss_private.season_best
    WHERE year = ${year} AND cat = ${cat} AND (${gender} = 'A' OR gender = ${gender})`;
  return row;
}

export async function getPlacement(category: SeasonCategory, timeMs: number, gender: "M" | "F" | "A", birthYear: number | null, year: number): Promise<Placement> {
  await ensureFresh();

  // early in the season there is too little to compare with, so use last year
  let fieldYear = year;
  let stats = await fieldStats(category, year, gender, timeMs);
  if (stats.n < 30) {
    const prev = await fieldStats(category, year - 1, gender, timeMs);
    if (prev.n > stats.n) {
      stats = prev;
      fieldYear = year - 1;
    }
  }

  let national: Placement["national"] = null;
  if (stats.n > 0) {
    // histogram between the 1st and 99th percentile, so outliers don't flatten it
    const min = Number(stats.p01), max = Number(stats.p99);
    const span = Math.max(1, max - min);
    const bins = await prisma.$queryRaw<{ b: number; n: number }[]>`
      SELECT LEAST(${BINS - 1}, GREATEST(0, floor((best - ${min})::float8 / ${span} * ${BINS})::int)) AS b, COUNT(*)::int AS n
      FROM ss_private.season_best
      WHERE year = ${fieldYear} AND cat = ${category} AND (${gender} = 'A' OR gender = ${gender})
      GROUP BY 1`;
    const histogram = new Array(BINS).fill(0);
    for (const r of bins) histogram[r.b] = r.n;
    const bin = Math.max(0, Math.min(BINS - 1, Math.floor(((timeMs - min) / span) * BINS)));
    const marks = [
      { p: 10, t: Number(stats.p10) },
      { p: 25, t: Number(stats.p25) },
      { p: 50, t: Number(stats.p50) },
    ];
    national = { rank: stats.faster + 1, total: stats.n + 1, beaten: (stats.n - stats.faster) / (stats.n + 1), histogram, bin, min, max, marks };
  }

  let ageClass: Placement["ageClass"] = null;
  if (birthYear && gender !== "A") {
    const cls = ageClassFor(birthYear, gender, fieldYear);
    if (cls) {
      const { from, to } = birthRange(cls, fieldYear);
      const [c] = await prisma.$queryRaw<{ n: number; faster: number }[]>`
        SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE best < ${timeMs})::int AS faster
        FROM ss_private.season_best
        WHERE year = ${fieldYear} AND cat = ${category} AND gender = ${gender} AND birth_year BETWEEN ${from} AND ${to}`;
      if (c.n > 0) ageClass = { label: cls.label, rank: c.faster + 1, total: c.n + 1, beaten: (c.n - c.faster) / (c.n + 1) };
    }
  }

  // the season's biggest races: finishers faster than the time, per race (index on race_id, time_ms)
  const big = await prisma.$queryRaw<{ race_id: string; event_id: string; name: string; date: Date | null; location: string | null; finishers: number; faster: number }[]>`
    SELECT b.race_id::text, b.event_id::text, b.name, b.date, b.location, b.finishers,
      (SELECT COUNT(*) FROM results r WHERE r.race_id = b.race_id AND r.time_ms > 0 AND r.time_ms < ${timeMs} AND NOT (r.raw ? 'ArrangementUID'))::int AS faster
    FROM ss_private.season_big_races b
    WHERE b.year = ${fieldYear} AND b.cat = ${category}
    ORDER BY b.pos`;
  const races = big.map((r) => ({
    event_id: r.event_id,
    race_id: r.race_id,
    name: r.name,
    date: r.date ? r.date.toISOString().slice(0, 10) : null,
    location: r.location,
    rank: r.faster + 1,
    total: r.finishers + 1,
  }));

  return { year: fieldYear, national, ageClass, races };
}
