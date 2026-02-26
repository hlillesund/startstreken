// src/app/api/rankings/route.ts
import { prisma } from "@/lib/prisma";

const ALLOWED_CATEGORIES = new Set(["5K", "10K", "HM", "M"] as const);

function isUuid(v: string) {
  // enkel uuid v4-ish check (god nok for å unngå obvious feil)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const athleteId = String(url.searchParams.get("athleteId") ?? "").trim();
  const category = String(url.searchParams.get("category") ?? "").trim();
  const yearStr = String(url.searchParams.get("year") ?? "").trim();

  if (!isUuid(athleteId)) {
    return Response.json({ ok: false, error: "INVALID_ATHLETE_ID" }, { status: 400 });
  }
  if (!ALLOWED_CATEGORIES.has(category as any)) {
    return Response.json({ ok: false, error: "INVALID_CATEGORY" }, { status: 400 });
  }

  const year = Number(yearStr);
  if (!Number.isFinite(year) || year < 1900 || year > 3000) {
    return Response.json({ ok: false, error: "INVALID_YEAR" }, { status: 400 });
  }

  // Date-range i stedet for EXTRACT(YEAR...) (ofte bedre for indeksbruk)
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));

  // NB: cast athleteId til uuid i WHERE
  const rows = await prisma.$queryRaw<
    { athlete_id: string; best_time_ms: number; rank: number; total: number }[]
  >`
    WITH best AS (
      SELECT
        r.athlete_id,
        MIN(r.time_ms) AS best_time_ms
      FROM results r
      JOIN races ra ON ra.id = r.race_id
      JOIN events e ON e.id = ra.event_id
      WHERE r.distance_category = ${category}
        AND e.start_date >= ${from}
        AND e.start_date < ${to}
      GROUP BY r.athlete_id
    ),
    ranked AS (
      SELECT
        athlete_id,
        best_time_ms,
        DENSE_RANK() OVER (ORDER BY best_time_ms ASC) AS rank,
        COUNT(*) OVER () AS total
      FROM best
    )
    SELECT
      athlete_id::text AS athlete_id,
      best_time_ms::bigint AS best_time_ms,
      rank,
      total
    FROM ranked
    WHERE athlete_id = ${athleteId}::uuid
    LIMIT 1;
  `;

  const row = rows[0];
  if (!row) {
    // Ingen ranking for denne utøveren i dette året/kategorien
    return Response.json({ ok: true, rank: null, total: 0, best_time_ms: null });
  }

  return Response.json({
    ok: true,
    rank: Number(row.rank),
    total: Number(row.total),
    best_time_ms: Number(row.best_time_ms),
  });
}