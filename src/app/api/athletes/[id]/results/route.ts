import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 1. Fetch all results for this athlete
  const results = await prisma.results.findMany({
    where: { athlete_id: id, time_ms: { gt: 0 } },
    select: {
      id:                true,
      time_ms:           true,
      rank_overall:      true,
      rank_gender:       true,
      distance_category: true,
      club:              true,
      bib:               true,
      races: {
        select: {
          id:   true,
          name: true,
          _count: { select: { results: true } },
          events: {
            select: {
              name:       true,
              start_date: true,
              location:   true,
            },
          },
        },
      },
    },
    orderBy: [
      { races: { events: { start_date: "desc" } } },
    ],
  });

  if (results.length === 0) return NextResponse.json([]);

  // 2. Get gender-specific finisher counts per race in one query
  //    groupBy race_id + athlete gender
  const raceIds = [...new Set(results.map((r) => r.races.id))];

  // Raw SQL via $queryRaw is cleanest here — one round trip
  const genderCounts = await prisma.$queryRaw<
    { race_id: string; gender: string; cnt: bigint }[]
  >`
    SELECT r.race_id, a.gender, COUNT(*)::bigint AS cnt
    FROM results r
    JOIN athletes a ON a.id = r.athlete_id
    WHERE r.race_id = ANY(${raceIds}::uuid[])
      AND r.time_ms > 0
      AND a.gender IS NOT NULL
    GROUP BY r.race_id, a.gender
  `;

  // Build lookup: raceId → { M: n, F: n }
  const genderMap = new Map<string, { M: number; F: number }>();
  for (const row of genderCounts) {
    if (!genderMap.has(row.race_id)) genderMap.set(row.race_id, { M: 0, F: 0 });
    const entry = genderMap.get(row.race_id)!;
    if (row.gender === "M") entry.M = Number(row.cnt);
    if (row.gender === "F") entry.F = Number(row.cnt);
  }

  // 3. Shape the output
  const out = results.map((r) => {
    const gc = genderMap.get(r.races.id);
    return {
      race_id:            r.races.id,
      race_name:          r.races.name,
      event_name:         r.races.events.name,
      start_date:         r.races.events.start_date?.toISOString().split("T")[0] ?? null,
      location:           r.races.events.location ?? null,
      time_ms:            r.time_ms,
      distance_category:  r.distance_category,
      club:               r.club,
      bib:                r.bib,
      rank_overall:       r.rank_overall ?? null,
      rank_gender:        r.rank_gender ?? null,
      total_finishers:    r.races._count.results,
      total_finishers_m:  gc?.M ?? null,
      total_finishers_f:  gc?.F ?? null,
    };
  });

  return NextResponse.json(out);
}