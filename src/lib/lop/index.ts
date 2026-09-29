import { revalidateTag, unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { cleanEventName, nameKey, slugFromParam } from "./names";

/*
 * The race index behind /lop and the admin: every fully imported event, the
 * stats of each of its races, and which "løp" (race across the years) it is an
 * edition of.
 *
 * Grouping:
 *  - an event linked to a series belongs to that series;
 *  - an unlinked event joins the series whose name — or one of whose linked
 *    events' names — gives the same name key, so new editions attach themselves;
 *  - otherwise events group by name key alone ("Ulriken Opp 2024" + "Ulriken Opp 2026").
 * A series holding a single event of the same name says nothing and is ignored
 * (older imports created one per event).
 *
 * Only fully imported results count: rows added from one athlete's EQ history
 * (raw ? 'ArrangementUID') are a partial field.
 */

export const LOP_TAG = "lop";

export const MAIN_CATS = ["5K", "10K", "HM", "M"] as const;
export const CAT_LABEL: Record<string, string> = { "5K": "5 km", "10K": "10 km", HM: "Halvmaraton", M: "Maraton", OTHER: "Annet" };
export const CAT_ORDER: Record<string, number> = { M: 0, HM: 1, "10K": 2, "5K": 3, OTHER: 4 };

export type RaceStat = {
  id: string;
  eventId: string;
  name: string;
  /** Distance category of the race (the one most of its results have). */
  cat: string;
  distanceM: number | null;
  /** All finishers, and those counted in the stats (results in the race's category, so no para/implausible times). */
  total: number;
  n: number;
  nM: number;
  nF: number;
  sum: number;
  sumM: number;
  sumF: number;
  best: number | null;
};

export type LopEvent = {
  id: string;
  name: string;
  date: string | null;
  location: string | null;
  seriesId: string | null;
  finishers: number;
  races: RaceStat[];
};

export type Course = {
  /** Main category, or "o-<race name key>" for other distances. */
  key: string;
  cat: string;
  label: string;
  editions: number;
  n: number;
  nM: number;
  nF: number;
  avg: number | null;
  avgM: number | null;
  avgF: number | null;
  best: number | null;
};

export type LopGroup = {
  slug: string;
  name: string;
  location: string | null;
  /** Series that defines the group; null for groups formed by name alone. */
  seriesId: string | null;
  /** Newest first. */
  eventIds: string[];
  first: string | null;
  last: string | null;
  finishers: number;
  courses: Course[];
};

export type LopIndex = {
  groups: LopGroup[];
  events: Record<string, LopEvent>;
  groupOf: Record<string, string>;
  /** Other slugs that lead to a group (edition name keys, old series slugs). */
  aliases: Record<string, string>;
};

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

type StatRow = {
  race_id: string;
  cat: string | null;
  n: number;
  n_m: number;
  n_f: number;
  s: bigint;
  s_m: bigint;
  s_f: bigint;
  best: number;
};

export async function buildLopIndex(): Promise<LopIndex> {
  const [stats, races, events, series] = await Promise.all([
    prisma.$queryRaw<StatRow[]>`
      SELECT r.race_id::text, r.distance_category AS cat,
        count(*)::int AS n,
        count(*) FILTER (WHERE a.gender = 'M')::int AS n_m,
        count(*) FILTER (WHERE a.gender = 'F')::int AS n_f,
        sum(r.time_ms)::bigint AS s,
        coalesce(sum(r.time_ms) FILTER (WHERE a.gender = 'M'), 0)::bigint AS s_m,
        coalesce(sum(r.time_ms) FILTER (WHERE a.gender = 'F'), 0)::bigint AS s_f,
        min(r.time_ms)::int AS best
      FROM public.results r
      JOIN public.athletes a ON a.id = r.athlete_id
      WHERE r.time_ms > 0 AND NOT (r.raw ? 'ArrangementUID')
      GROUP BY 1, 2`,
    prisma.races.findMany({ select: { id: true, event_id: true, name: true, distance_m: true } }),
    prisma.events.findMany({ select: { id: true, name: true, start_date: true, location: true, series_id: true } }),
    prisma.event_series.findMany({ select: { id: true, name: true, slug: true, created_at: true } }),
  ]);

  /* ── Races with their stats ── */
  const byRace = new Map<string, StatRow[]>();
  for (const s of stats) byRace.set(s.race_id, [...(byRace.get(s.race_id) ?? []), s]);

  const raceStats = new Map<string, RaceStat[]>(); // event id → races
  for (const ra of races) {
    const rows = byRace.get(ra.id);
    if (!rows) continue;
    const main = rows.reduce((a, b) => (b.n > a.n ? b : a));
    const stat: RaceStat = {
      id: ra.id,
      eventId: ra.event_id,
      name: ra.name,
      cat: main.cat ?? "OTHER",
      distanceM: ra.distance_m,
      total: rows.reduce((t, r) => t + r.n, 0),
      n: main.n,
      nM: main.n_m,
      nF: main.n_f,
      sum: Number(main.s),
      sumM: Number(main.s_m),
      sumF: Number(main.s_f),
      best: main.best,
    };
    raceStats.set(ra.event_id, [...(raceStats.get(ra.event_id) ?? []), stat]);
  }

  /* ── Events ── */
  const lopEvents: Record<string, LopEvent> = {};
  for (const e of events) {
    const rs = raceStats.get(e.id);
    if (!rs) continue;
    rs.sort((a, b) => b.total - a.total);
    lopEvents[e.id] = {
      id: e.id,
      name: e.name,
      date: iso(e.start_date),
      location: e.location,
      seriesId: e.series_id,
      finishers: rs.reduce((t, r) => t + r.total, 0),
      races: rs,
    };
  }

  /* ── Series: which are meaningful, and which name keys they claim ── */
  const members = new Map<string, { name: string }[]>();
  for (const e of events) if (e.series_id) members.set(e.series_id, [...(members.get(e.series_id) ?? []), e]);
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const seriesById = new Map(series.map((s) => [s.id, s]));
  const realSeries = series.filter((s) => {
    const m = members.get(s.id) ?? [];
    return m.length > 1 || (m.length === 1 && !same(m[0].name, s.name));
  });
  const realIds = new Set(realSeries.map((s) => s.id));

  const claims = new Map<string, string>(); // name key → series id
  const bySize = [...realSeries].sort(
    (a, b) => (members.get(b.id)?.length ?? 0) - (members.get(a.id)?.length ?? 0) || a.created_at.getTime() - b.created_at.getTime()
  );
  for (const s of bySize) {
    const k = nameKey(s.name);
    if (k && !claims.has(k)) claims.set(k, s.id);
  }
  for (const s of bySize) {
    for (const m of members.get(s.id) ?? []) {
      const k = nameKey(m.name);
      if (k && !claims.has(k)) claims.set(k, s.id);
    }
  }

  /* ── Groups ── */
  const buckets = new Map<string, LopEvent[]>();
  for (const ev of Object.values(lopEvents)) {
    const k = nameKey(ev.name) || `lop-${ev.id.slice(0, 8)}`;
    const sid = ev.seriesId && realIds.has(ev.seriesId) ? ev.seriesId : claims.get(k);
    const id = sid ? `s:${sid}` : `k:${k}`;
    buckets.set(id, [...(buckets.get(id) ?? []), ev]);
  }

  const groups: LopGroup[] = [];
  for (const [id, evs] of buckets) {
    evs.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    const seriesId = id.startsWith("s:") ? id.slice(2) : null;
    const s = seriesId ? seriesById.get(seriesId) : null;
    const name = cleanEventName(s?.name ?? evs[0].name) || s?.name || evs[0].name;
    groups.push({
      slug: s ? nameKey(s.name) || `serie-${s.id.slice(0, 8)}` : id.slice(2),
      name,
      location: evs.find((e) => e.location)?.location ?? null,
      seriesId,
      eventIds: evs.map((e) => e.id),
      first: evs.reduce<string | null>((m, e) => (e.date && (!m || e.date < m) ? e.date : m), null),
      last: evs[0].date,
      finishers: evs.reduce((t, e) => t + e.finishers, 0),
      courses: buildCourses(evs),
    });
  }

  // Unique slugs: the bigger race keeps the plain one.
  groups.sort((a, b) => b.eventIds.length - a.eventIds.length || b.finishers - a.finishers || a.slug.localeCompare(b.slug));
  const taken = new Set<string>();
  for (const g of groups) {
    let slug = g.slug;
    for (let i = 2; taken.has(slug); i++) slug = `${g.slug}-${i}`;
    taken.add(slug);
    g.slug = slug;
  }

  const groupOf: Record<string, string> = {};
  const aliases: Record<string, string> = {};
  for (const g of groups) {
    for (const id of g.eventIds) {
      groupOf[id] = g.slug;
      const k = nameKey(lopEvents[id].name);
      if (k && !taken.has(k) && !aliases[k]) aliases[k] = g.slug;
    }
    const legacy = g.seriesId ? seriesById.get(g.seriesId)?.slug : null;
    if (legacy && !taken.has(legacy) && !aliases[legacy]) aliases[legacy] = g.slug;
  }

  return { groups, events: lopEvents, groupOf, aliases };
}

export function courseKey(race: Pick<RaceStat, "cat" | "name">): string {
  return race.cat !== "OTHER" ? race.cat : `o-${nameKey(race.name) || "lop"}`;
}

export function avgOf(sum: number, n: number): number | null {
  return n > 0 ? Math.round(sum / n) : null;
}

/** Combine the races of the given editions into courses (one per distance). */
export function buildCourses(evs: LopEvent[]): Course[] {
  const acc = new Map<string, Course & { sum: number; sumM: number; sumF: number; eds: Set<string> }>();
  for (const ev of evs) {
    for (const r of ev.races) {
      const key = courseKey(r);
      let c = acc.get(key);
      if (!c) {
        c = {
          key,
          cat: r.cat,
          label: r.cat !== "OTHER" ? CAT_LABEL[r.cat] : cleanEventName(r.name) || r.name,
          editions: 0,
          n: 0,
          nM: 0,
          nF: 0,
          avg: null,
          avgM: null,
          avgF: null,
          best: null,
          sum: 0,
          sumM: 0,
          sumF: 0,
          eds: new Set(),
        };
        acc.set(key, c);
      }
      c.eds.add(ev.id);
      c.n += r.n;
      c.nM += r.nM;
      c.nF += r.nF;
      c.sum += r.sum;
      c.sumM += r.sumM;
      c.sumF += r.sumF;
      if (r.best != null && (c.best == null || r.best < c.best)) c.best = r.best;
    }
  }
  return [...acc.values()]
    .map(({ sum, sumM, sumF, eds, ...c }) => ({
      ...c,
      editions: eds.size,
      avg: avgOf(sum, c.n),
      avgM: avgOf(sumM, c.nM),
      avgF: avgOf(sumF, c.nF),
    }))
    .sort((a, b) => (CAT_ORDER[a.cat] ?? 9) - (CAT_ORDER[b.cat] ?? 9) || b.n - a.n);
}

export const getLopIndex = unstable_cache(buildLopIndex, ["lop-index-v1"], { revalidate: 3600, tags: [LOP_TAG] });

/** After admin changes: the next request rebuilds the index. */
export function invalidateLop() {
  try {
    revalidateTag(LOP_TAG, { expire: 0 });
  } catch {
    // outside a request (scripts) — the index refreshes within the hour anyway
  }
}

/** After imports: serve the old index while a fresh one is built. */
export function touchLop() {
  try {
    revalidateTag(LOP_TAG, "max");
  } catch {
    // outside a request (scripts)
  }
}

export function findGroup(index: LopIndex, param: string): LopGroup | null {
  const bySlug = (s: string) => index.groups.find((g) => g.slug === s) ?? null;
  const direct = param.toLowerCase();
  const norm = slugFromParam(param);
  for (const s of [direct, norm]) {
    const hit = bySlug(s) ?? (index.aliases[s] ? bySlug(index.aliases[s]) : null);
    if (hit) return hit;
  }
  return null;
}
