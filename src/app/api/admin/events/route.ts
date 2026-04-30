import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function slugify(value: string) {
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
  const q    = searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const take = 30;
  const skip = (page - 1) * take;

  const where = q
    ? {
        OR: [
          { name:           { contains: q, mode: "insensitive" as const } },
          { source_event_id:{ contains: q, mode: "insensitive" as const } },
          { location:       { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [events, total] = await Promise.all([
    prisma.events.findMany({
      where,
      orderBy: { start_date: "desc" },
      skip,
      take,
      include: {
        event_series: { select: { id: true, name: true, slug: true } },
        races: {
          select: {
            id: true,
            name: true,
            distance_category_override: true,
            _count: { select: { results: true } },
            results: {
              select: { distance_category: true },
              distinct: ["distance_category"],
              where: { distance_category: { not: null } },
            },
          },
        },
      },
    }),
    prisma.events.count({ where }),
  ]);

  // Enrich each event with aggregated stats
  const enriched = events.map((ev) => {
    const allDistances = new Set<string>();
    let totalResults = 0;

    for (const race of ev.races) {
      totalResults += race._count.results;
      const dist = race.distance_category_override
        ?? race.results[0]?.distance_category
        ?? null;
      if (dist) allDistances.add(dist);
    }

    return {
      id:             ev.id,
      name:           ev.name,
      source_event_id: ev.source_event_id,
      start_date:     ev.start_date?.toISOString().split("T")[0] ?? null,
      location:       ev.location,
      series:         ev.event_series ?? null,
      race_count:     ev.races.length,
      result_count:   totalResults,
      distances:      [...allDistances].sort(),
    };
  });

  return NextResponse.json({ events: enriched, total, page, pages: Math.ceil(total / take) });
}

