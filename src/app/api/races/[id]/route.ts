import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DIST_METERS: Record<string, number> = {
  "5K": 5000, "10K": 10000, HM: 21097, M: 42195,
};

const BUCKETS: Record<string, { label: string; minMs: number; maxMs: number }[]> = {
  "5K": [
    { label: "u/15m",   minMs: 0,            maxMs: 15 * 60_000 },
    { label: "15–18",   minMs: 15 * 60_000,  maxMs: 18 * 60_000 },
    { label: "18–22",   minMs: 18 * 60_000,  maxMs: 22 * 60_000 },
    { label: "22–27",   minMs: 22 * 60_000,  maxMs: 27 * 60_000 },
    { label: "27–35",   minMs: 27 * 60_000,  maxMs: 35 * 60_000 },
    { label: "o/35m",   minMs: 35 * 60_000,  maxMs: Infinity },
  ],
  "10K": [
    { label: "u/32m",   minMs: 0,            maxMs: 32 * 60_000 },
    { label: "32–38",   minMs: 32 * 60_000,  maxMs: 38 * 60_000 },
    { label: "38–45",   minMs: 38 * 60_000,  maxMs: 45 * 60_000 },
    { label: "45–55",   minMs: 45 * 60_000,  maxMs: 55 * 60_000 },
    { label: "55–70",   minMs: 55 * 60_000,  maxMs: 70 * 60_000 },
    { label: "o/70m",   minMs: 70 * 60_000,  maxMs: Infinity },
  ],
  HM: [
    { label: "u/1:20",  minMs: 0,            maxMs: 80 * 60_000 },
    { label: "1:20–30", minMs: 80 * 60_000,  maxMs: 90 * 60_000 },
    { label: "1:30–45", minMs: 90 * 60_000,  maxMs: 105 * 60_000 },
    { label: "1:45–2h", minMs: 105 * 60_000, maxMs: 120 * 60_000 },
    { label: "2:00–15", minMs: 120 * 60_000, maxMs: 135 * 60_000 },
    { label: "2:15–30", minMs: 135 * 60_000, maxMs: 150 * 60_000 },
    { label: "o/2:30",  minMs: 150 * 60_000, maxMs: Infinity },
  ],
  M: [
    { label: "u/2:30",  minMs: 0,            maxMs: 150 * 60_000 },
    { label: "2:30–3h", minMs: 150 * 60_000, maxMs: 180 * 60_000 },
    { label: "3:00–30", minMs: 180 * 60_000, maxMs: 210 * 60_000 },
    { label: "3:30–4h", minMs: 210 * 60_000, maxMs: 240 * 60_000 },
    { label: "4:00–30", minMs: 240 * 60_000, maxMs: 270 * 60_000 },
    { label: "4:30–5h", minMs: 270 * 60_000, maxMs: 300 * 60_000 },
    { label: "o/5h",    minMs: 300 * 60_000, maxMs: Infinity },
  ],
};

function fmtMs(ms: number | null): string {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function avg(arr: number[]): number | null {
  if (!arr.length) return null;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // id is a URL-encoded slug like "bergen-city-half-marathon"
  // Decode it back to a name fragment and find matching events
  const slug = decodeURIComponent(params.id);

  // Also accept a ?category= override; fall back to inferring from results
  const { searchParams } = new URL(req.url);
  const categoryParam = searchParams.get("category");

  // Reconstruct the original name from the slug (replace hyphens with spaces)
  // Then do a case-insensitive search
  const nameSearch = slug.replace(/-/g, " ");

  // Find all events whose name matches (case-insensitive)
  const matchingEvents = await prisma.events.findMany({
    where: {
      name: { equals: nameSearch, mode: "insensitive" },
    },
    select: { id: true, name: true, start_date: true, location: true },
    orderBy: { start_date: "desc" },
  });

  if (matchingEvents.length === 0) {
    return NextResponse.json({ ok: false, error: "Race not found" }, { status: 404 });
  }

  const canonicalName = matchingEvents[0].name;
  const eventIds = matchingEvents.map((e) => e.id);

  // Find all races under these events
  const allRaces = await prisma.races.findMany({
    where: { event_id: { in: eventIds } },
    select: { id: true, event_id: true },
  });
  const allRaceIds = allRaces.map((r) => r.id);

  // All results across every edition, with athlete gender
  const allResults = await prisma.results.findMany({
    where: {
      race_id: { in: allRaceIds },
      time_ms: { gt: 0 },
      ...(categoryParam ? { distance_category: categoryParam } : {}),
    },
    select: {
      time_ms: true,
      distance_category: true,
      club: true,
      rank_overall: true,
      athlete_id: true,
      race_id: true,
      athletes: { select: { id: true, display_name: true, gender: true } },
    },
    orderBy: { time_ms: "asc" },
  });

  if (allResults.length === 0) {
    return NextResponse.json({ ok: false, error: "No results found" }, { status: 404 });
  }

  // Infer dominant distance_category from results
  const catCounts = new Map<string, number>();
  for (const r of allResults) {
    if (r.distance_category) {
      catCounts.set(r.distance_category, (catCounts.get(r.distance_category) ?? 0) + 1);
    }
  }
  const cat = categoryParam
    ?? [...catCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    ?? "HM";

  const results = allResults.filter((r) => r.distance_category === cat);

  // Split by gender
  const resultsM = results.filter((r) => r.athletes?.gender?.toUpperCase() === "M");
  const resultsF = results.filter((r) => r.athletes?.gender?.toUpperCase() === "F");

  const allTimes  = results.map((r) => r.time_ms);
  const timesM    = resultsM.map((r) => r.time_ms);
  const timesF    = resultsF.map((r) => r.time_ms);

  const avg_time_ms   = avg(allTimes)!;
  const avg_time_m_ms = avg(timesM);
  const avg_time_f_ms = avg(timesF);

  const distM = DIST_METERS[cat] ?? null;
  const avg_pace_ms_per_km = distM ? Math.round(avg_time_ms / (distM / 1000)) : 0;

  // Course record = single fastest result across all editions
  const courseRecord = results[0] ?? null;

  // ── YEAR BY YEAR ────────────────────────────────────────────────────────
  // Build a map: event_id → event metadata
  const eventMap = new Map(matchingEvents.map((e) => [e.id, e]));
  // Build a map: race_id → event_id
  const raceToEvent = new Map(allRaces.map((r) => [r.id, r.event_id]));

  type YearBucket = { times: number[]; timesM: number[]; timesF: number[] };
  const yearBuckets = new Map<number, YearBucket>();

  for (const r of results) {
    const eventId = raceToEvent.get(r.race_id);
    if (!eventId) continue;
    const event = eventMap.get(eventId);
    if (!event?.start_date) continue;
    const year = new Date(event.start_date).getFullYear();

    if (!yearBuckets.has(year)) {
      yearBuckets.set(year, { times: [], timesM: [], timesF: [] });
    }
    const b = yearBuckets.get(year)!;
    b.times.push(r.time_ms);
    const g = r.athletes?.gender?.toUpperCase();
    if (g === "M") b.timesM.push(r.time_ms);
    else if (g === "F") b.timesF.push(r.time_ms);
  }

  const yearly = [...yearBuckets.entries()]
    .sort((a, b) => b[0] - a[0]) // newest first
    .map(([year, b], i, arr) => {
      const avgAll  = avg(b.times)!;
      const avgM    = avg(b.timesM);
      const avgF    = avg(b.timesF);
      const prevAvg = i < arr.length - 1 ? avg(arr[i + 1][1].times) : null;
      return {
        year,
        finisher_count: b.times.length,
        finisher_count_m: b.timesM.length,
        finisher_count_f: b.timesF.length,
        avg_time_ms: avgAll,
        avg_time_formatted: fmtMs(avgAll),
        avg_time_m_ms: avgM,
        avg_time_m_formatted: fmtMs(avgM),
        avg_time_f_ms: avgF,
        avg_time_f_formatted: fmtMs(avgF),
        // delta vs previous year: negative = faster, positive = slower
        delta_ms: prevAvg !== null ? avgAll - prevAvg : null,
      };
    });

  // ── FINISH TIME DISTRIBUTION ─────────────────────────────────────────────
  const buckets = BUCKETS[cat] ?? [];
  const distribution = buckets.map((b) => {
    const all = results.filter((r) => r.time_ms >= b.minMs && r.time_ms < b.maxMs).length;
    const men = resultsM.filter((r) => r.time_ms >= b.minMs && r.time_ms < b.maxMs).length;
    const women = resultsF.filter((r) => r.time_ms >= b.minMs && r.time_ms < b.maxMs).length;
    return {
      label: b.label,
      count: all,
      count_m: men,
      count_f: women,
      pct: results.length ? Math.round((all / results.length) * 100) : 0,
    };
  });

  // ── TOP FINISHERS (per gender, all-time) ─────────────────────────────────
  const top_finishers_m = resultsM.slice(0, 10).map((r, i) => ({
    athlete_id: r.athlete_id,
    display_name: r.athletes?.display_name ?? "Ukjent",
    club: r.club ?? "",
    time_ms: r.time_ms,
    time_formatted: fmtMs(r.time_ms),
    rank: i + 1,
  }));

  const top_finishers_f = resultsF.slice(0, 10).map((r, i) => ({
    athlete_id: r.athlete_id,
    display_name: r.athletes?.display_name ?? "Ukjent",
    club: r.club ?? "",
    time_ms: r.time_ms,
    time_formatted: fmtMs(r.time_ms),
    rank: i + 1,
  }));

  // ── COMPARABLE RACES ─────────────────────────────────────────────────────
  // Get top 5 race series in same category by avg time, for the comparison bars
  const allCatResults = await prisma.results.findMany({
    where: { distance_category: cat, time_ms: { gt: 0 } },
    select: {
      time_ms: true,
      races: { select: { events: { select: { name: true } } } },
    },
  });

  type CompGroup = { times: number[] };
  const compGroups = new Map<string, CompGroup>();
  for (const r of allCatResults) {
    const name = r.races?.events?.name?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!compGroups.has(key)) compGroups.set(key, { times: [] });
    compGroups.get(key)!.times.push(r.time_ms);
  }

  const comparable_races = [...compGroups.entries()]
    .map(([, g]) => ({ times: g.times }))
    .filter((g) => g.times.length >= 5)
    .map((g) => {
      const name = [...compGroups.entries()].find(([, v]) => v === g)?.[0] ?? "";
      return { name, avg: avg(g.times)! };
    })
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 5)
    .map((r) => ({
      name: r.name,
      avg_time_ms: r.avg,
      avg_time_formatted: fmtMs(r.avg),
      is_this: r.name === canonicalName.toLowerCase(),
    }));

  return NextResponse.json({
    ok: true,
    race: {
      id: params.id,
      name: canonicalName,
      location: matchingEvents[0].location ?? null,
      distance_category: cat,

      // all-time combined stats
      finisher_count: results.length,
      finisher_count_m: resultsM.length,
      finisher_count_f: resultsF.length,

      avg_time_ms,
      avg_time_formatted: fmtMs(avg_time_ms),
      avg_time_m_ms,
      avg_time_m_formatted: fmtMs(avg_time_m_ms),
      avg_time_f_ms,
      avg_time_f_formatted: fmtMs(avg_time_f_ms),

      avg_pace_ms_per_km,
      avg_pace_formatted: distM ? fmtMs(avg_pace_ms_per_km) + "/km" : "—",

      course_record_ms: courseRecord?.time_ms ?? 0,
      course_record_formatted: fmtMs(courseRecord?.time_ms ?? 0),
      course_record_athlete: courseRecord?.athletes?.display_name ?? "Ukjent",

      // breakdown
      yearly,
      distribution,
      top_finishers_m,
      top_finishers_f,
      comparable_races,

      edition_count: matchingEvents.length,
    },
  });
}