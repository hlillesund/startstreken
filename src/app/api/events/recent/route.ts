// src/app/api/events/recent/route.ts
// Latest events that have (fully imported) results.
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  name: string;
  start_date: Date | null;
  location: string | null;
  finishers: bigint;
  categories: (string | null)[] | null;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit") ?? 6) || 6));

  try {
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT e.id::text, e.name, e.start_date, e.location,
             COUNT(r.id)::bigint AS finishers,
             ARRAY_AGG(DISTINCT r.distance_category) AS categories
      FROM events e
      JOIN races ra ON ra.event_id = e.id
      JOIN results r ON r.race_id = ra.id
      WHERE e.start_date IS NOT NULL
        AND e.start_date <= CURRENT_DATE
        AND r.time_ms > 0
        AND NOT (r.raw ? 'ArrangementUID')
      GROUP BY e.id
      HAVING COUNT(r.id) >= 5
      ORDER BY e.start_date DESC, COUNT(r.id) DESC
      LIMIT ${limit}
    `;

    const order = ["5K", "10K", "HM", "M"];
    return Response.json(
      {
        ok: true,
        events: rows.map((r) => ({
          id: r.id,
          name: r.name,
          start_date: r.start_date ? r.start_date.toISOString().split("T")[0] : null,
          location: r.location,
          finishers: Number(r.finishers),
          categories: (r.categories ?? [])
            .filter((c): c is string => !!c && order.includes(c))
            .sort((a, b) => order.indexOf(a) - order.indexOf(b)),
        })),
      },
      { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=86400" } }
    );
  } catch (err) {
    console.error("[events/recent] error:", err);
    return Response.json({ ok: false, events: [] }, { status: 500 });
  }
}
