// «Hvor havner jeg?»: where a given time places in this season's field.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { SEASON_TAG, getField, type Field, type SeasonCategory } from "@/lib/season";
import { ageClassFor, birthRange } from "@/lib/age-class";

const TTL = 1800;

function yearRange(year: number) {
  return { from: new Date(Date.UTC(year, 0, 1)), to: new Date(Date.UTC(year + 1, 0, 1)) };
}

type BigRace = { event_id: string; race_id: string; name: string; date: string | null; location: string | null; times: number[] };

/** The season's biggest races on a distance, with every finishing time (sorted). */
async function loadBigRaces(category: SeasonCategory, year: number): Promise<BigRace[]> {
  const { from, to } = yearRange(year);
  const rows = await prisma.$queryRaw<{ event_id: string; race_id: string; name: string; start_date: Date | null; location: string | null; times: number[] }[]>`
    WITH big AS (
      SELECT ra.id AS race_id, COUNT(*) AS n
      FROM results r
      JOIN races ra ON ra.id = r.race_id
      JOIN events e ON e.id = ra.event_id
      WHERE r.distance_category = ${category}
        AND NOT (r.raw ? 'ArrangementUID')
        AND r.time_ms > 0
        AND e.start_date >= ${from}
        AND e.start_date < ${to}
      GROUP BY ra.id
      ORDER BY n DESC
      LIMIT 6
    )
    SELECT e.id::text AS event_id, ra.id::text AS race_id, e.name, e.start_date, e.location,
           array_agg(r.time_ms ORDER BY r.time_ms) AS times
    FROM big
    JOIN races ra ON ra.id = big.race_id
    JOIN events e ON e.id = ra.event_id
    JOIN results r ON r.race_id = ra.id AND r.time_ms > 0 AND NOT (r.raw ? 'ArrangementUID')
    GROUP BY e.id, ra.id, e.name, e.start_date, e.location, big.n
    ORDER BY big.n DESC
  `;
  return rows.map((r) => ({
    event_id: r.event_id,
    race_id: r.race_id,
    name: r.name,
    date: r.start_date ? r.start_date.toISOString().slice(0, 10) : null,
    location: r.location,
    times: r.times.map(Number),
  }));
}

const getBigRaces = unstable_cache(loadBigRaces, ["big-races-v1"], { revalidate: TTL, tags: [SEASON_TAG] });

function countBelow(sorted: number[], v: number) {
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function merge(a: Field, b: Field): Field {
  const idx = [...a.t.map((t, i) => ({ t, b: a.b[i] })), ...b.t.map((t, i) => ({ t, b: b.b[i] }))].sort((x, y) => x.t - y.t);
  return { t: idx.map((x) => x.t), b: idx.map((x) => x.b) };
}

export type Placement = {
  year: number;
  national: { rank: number; total: number; beaten: number; histogram: number[]; bin: number; min: number; max: number; marks: { p: number; t: number }[] } | null;
  ageClass: { label: string; rank: number; total: number; beaten: number } | null;
  races: { event_id: string; race_id: string; name: string; date: string | null; location: string | null; rank: number; total: number }[];
};

const BINS = 28;

export async function getPlacement(category: SeasonCategory, timeMs: number, gender: "M" | "F" | "A", birthYear: number | null, year: number): Promise<Placement> {
  // early in the season there is too little to compare with, so use last year
  let fieldYear = year;
  let field = await loadFieldFor(category, fieldYear, gender);
  if (field.t.length < 30) {
    const prev = await loadFieldFor(category, year - 1, gender);
    if (prev.t.length > field.t.length) {
      field = prev;
      fieldYear = year - 1;
    }
  }

  let national: Placement["national"] = null;
  if (field.t.length > 0) {
    const n = field.t.length;
    const faster = countBelow(field.t, timeMs);
    // histogram between the 1st and 99th percentile, so outliers don't flatten it
    const min = field.t[Math.floor(n * 0.01)];
    const max = field.t[Math.min(n - 1, Math.floor(n * 0.99))];
    const span = Math.max(1, max - min);
    const histogram = new Array(BINS).fill(0);
    for (const t of field.t) histogram[Math.max(0, Math.min(BINS - 1, Math.floor(((t - min) / span) * BINS)))]++;
    const bin = Math.max(0, Math.min(BINS - 1, Math.floor(((timeMs - min) / span) * BINS)));
    const marks = [10, 25, 50].map((p) => ({ p, t: field.t[Math.min(n - 1, Math.floor((n * p) / 100))] }));
    national = { rank: faster + 1, total: n + 1, beaten: (n - faster) / (n + 1), histogram, bin, min, max, marks };
  }

  let ageClass: Placement["ageClass"] = null;
  if (birthYear && gender !== "A") {
    const cls = ageClassFor(birthYear, gender, fieldYear);
    if (cls) {
      const { from, to } = birthRange(cls, fieldYear);
      let faster = 0, total = 0;
      field.t.forEach((t, i) => {
        const b = field.b[i];
        if (b == null || b < from || b > to) return;
        total++;
        if (t < timeMs) faster++;
      });
      if (total > 0) ageClass = { label: cls.label, rank: faster + 1, total: total + 1, beaten: (total - faster) / (total + 1) };
    }
  }

  const big = await getBigRaces(category, fieldYear);
  const races = big.map((r) => ({
    event_id: r.event_id,
    race_id: r.race_id,
    name: r.name,
    date: r.date,
    location: r.location,
    rank: countBelow(r.times, timeMs) + 1,
    total: r.times.length + 1,
  }));

  return { year: fieldYear, national, ageClass, races };
}

async function loadFieldFor(category: SeasonCategory, year: number, gender: "M" | "F" | "A"): Promise<Field> {
  if (gender !== "A") return getField(category, year, gender);
  const [m, f] = await Promise.all([getField(category, year, "M"), getField(category, year, "F")]);
  return merge(m, f);
}
