// src/app/api/stats/route.ts
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type StatsRow = { athletes: bigint; results: bigint; events: bigint; events_year: bigint };

export async function GET() {
  const year = new Date().getFullYear();
  const from = new Date(Date.UTC(year, 0, 1));

  try {
    const [row] = await prisma.$queryRaw<StatsRow[]>`
      SELECT
        (SELECT COUNT(*) FROM athletes)::bigint AS athletes,
        (SELECT COUNT(*) FROM results WHERE time_ms > 0)::bigint AS results,
        (SELECT COUNT(DISTINCT ra.event_id) FROM races ra WHERE EXISTS (SELECT 1 FROM results r WHERE r.race_id = ra.id))::bigint AS events,
        (SELECT COUNT(*) FROM events e WHERE e.start_date >= ${from}
           AND EXISTS (SELECT 1 FROM races ra JOIN results r ON r.race_id = ra.id WHERE ra.event_id = e.id))::bigint AS events_year
    `;

    return Response.json(
      {
        ok: true,
        year,
        athletes: Number(row?.athletes ?? 0),
        results: Number(row?.results ?? 0),
        events: Number(row?.events ?? 0),
        events_year: Number(row?.events_year ?? 0),
      },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } }
    );
  } catch (err) {
    console.error("[stats] error:", err);
    return Response.json({ ok: false }, { status: 500 });
  }
}
