import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SortKey = "fastest" | "latest" | "biggest";

function fmtMs(ms: number): string {
  if (!ms) return "—";

  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  return `${m}:${String(sec).padStart(2, "0")}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const category = searchParams.get("category") ?? "HM";
  const sort = (searchParams.get("sort") ?? "fastest") as SortKey;

  const rows = await prisma.results.findMany({
    where: {
      distance_category: category,
      time_ms: { gt: 0 },
    },
    select: {
      time_ms: true,
      athletes: {
        select: {
          gender: true,
        },
      },
      races: {
        select: {
          events: {
            select: {
              id: true,
              name: true,
              start_date: true,
              location: true,
              series_id: true,
              event_series: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
      },
    },
  });

  type Group = {
    id: string;
    slug: string;
    name: string;
    location: string | null;
    latest_date: string | null;
    event_ids: Set<string>;
    times: number[];
    times_m: number[];
    times_f: number[];
  };

  const groups = new Map<string, Group>();

  for (const r of rows) {
    const event = r.races?.events;
    if (!event) continue;

    const series = event.event_series;
    const dateStr = event.start_date?.toISOString().split("T")[0] ?? null;

    const groupKey = series?.id ?? event.id;
    const groupName = series?.name?.trim() || event.name.trim();
    const groupSlug = series?.slug || slugify(groupName);

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        id: groupKey,
        slug: groupSlug,
        name: groupName,
        location: event.location ?? null,
        latest_date: dateStr,
        event_ids: new Set([event.id]),
        times: [],
        times_m: [],
        times_f: [],
      });
    }

    const g = groups.get(groupKey)!;

    g.event_ids.add(event.id);
    g.times.push(r.time_ms);

    if (dateStr && (!g.latest_date || dateStr > g.latest_date)) {
      g.latest_date = dateStr;
      g.location = event.location ?? g.location;
    }

    const gender = r.athletes?.gender?.toUpperCase();

    if (gender === "M") {
      g.times_m.push(r.time_ms);
    } else if (gender === "F") {
      g.times_f.push(r.time_ms);
    }
  }

  function avg(arr: number[]) {
    return arr.length
      ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
      : null;
  }

  type OutRow = {
    id: string;
    name: string;
    location: string | null;
    latest_date: string | null;
    distance_category: string;
    finisher_count: number;
    avg_time_ms: number;
    avg_time_formatted: string;
    avg_time_m_ms: number | null;
    avg_time_m_formatted: string | null;
    avg_time_f_ms: number | null;
    avg_time_f_formatted: string | null;
    speed_rank: number;
    speed_rank_total: number;
    is_fastest: boolean;
  };

  const out: OutRow[] = [];

  for (const [, g] of groups) {
    if (g.times.length < 5) continue;

    const avgAll = avg(g.times);
    const avgM = avg(g.times_m);
    const avgF = avg(g.times_f);

    if (!avgAll) continue;

    out.push({
      id: g.slug,
      name: g.name,
      location: g.location,
      latest_date: g.latest_date,
      distance_category: category,
      finisher_count: g.times.length,
      avg_time_ms: avgAll,
      avg_time_formatted: fmtMs(avgAll),
      avg_time_m_ms: avgM,
      avg_time_m_formatted: avgM ? fmtMs(avgM) : null,
      avg_time_f_ms: avgF,
      avg_time_f_formatted: avgF ? fmtMs(avgF) : null,
      speed_rank: 0,
      speed_rank_total: 0,
      is_fastest: false,
    });
  }

  const bySpeed = [...out].sort((a, b) => a.avg_time_ms - b.avg_time_ms);

  bySpeed.forEach((r, i) => {
    const match = out.find((x) => x.id === r.id);

    if (match) {
      match.speed_rank = i + 1;
      match.speed_rank_total = out.length;
      match.is_fastest = i === 0;
    }
  });

  if (sort === "fastest") {
    out.sort((a, b) => a.avg_time_ms - b.avg_time_ms);
  } else if (sort === "biggest") {
    out.sort((a, b) => b.finisher_count - a.finisher_count);
  } else if (sort === "latest") {
    out.sort((a, b) => (b.latest_date ?? "").localeCompare(a.latest_date ?? ""));
  }

  return NextResponse.json(out);
}