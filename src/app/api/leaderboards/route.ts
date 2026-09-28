// src/app/api/leaderboards/route.ts
import { prisma } from "@/lib/prisma";

const ALLOWED_CATEGORIES = ["5K", "10K", "HM", "M"] as const;

type LeaderRow = {
  athlete_id: string;
  display_name: string;
  gender: string;
  best_time_ms: bigint;
  rank: bigint;
  club: string | null;
  event_name: string | null;
};

type Entry = {
  athlete_id: string;
  display_name: string;
  best_time_ms: number;
  rank: number;
  club?: string;
  event_name?: string;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const yearStr = String(url.searchParams.get("year") ?? new Date().getFullYear());
  const year = Number(yearStr);
  const limit = Math.min(10, Math.max(1, Number(url.searchParams.get("limit") ?? 5) || 5));

  if (!Number.isFinite(year) || year < 1900 || year > 3000) {
    return Response.json({ ok: false, error: "INVALID_YEAR" }, { status: 400 });
  }

  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));

  const results: Record<string, { M: Entry[]; F: Entry[] }> = {};

  await Promise.all(
    ALLOWED_CATEGORIES.map(async (category) => {
      results[category] = { M: [], F: [] };
      try {
        const rows = await prisma.$queryRaw<LeaderRow[]>`
          WITH best AS (
            SELECT DISTINCT ON (r.athlete_id)
              r.athlete_id,
              a.display_name,
              a.gender,
              r.time_ms AS best_time_ms,
              r.club,
              e.name AS event_name
            FROM results r
            JOIN races ra ON ra.id = r.race_id
            JOIN events e ON e.id = ra.event_id
            JOIN athletes a ON a.id = r.athlete_id
            WHERE r.distance_category = ${category}
              -- only fully imported events (profile-view history rows are partial fields)
              AND NOT (r.raw ? 'ArrangementUID')
              AND r.time_ms > 0
              AND e.start_date >= ${from}
              AND e.start_date < ${to}
              AND a.gender IN ('M', 'F')
            ORDER BY r.athlete_id, r.time_ms ASC
          ),
          ranked AS (
            SELECT *,
              DENSE_RANK() OVER (PARTITION BY gender ORDER BY best_time_ms ASC) AS rank
            FROM best
          )
          SELECT athlete_id::text, display_name, gender, best_time_ms::bigint, rank, club, event_name
          FROM ranked
          WHERE rank <= ${limit}
          ORDER BY gender, rank, display_name;
        `;

        for (const row of rows) {
          const entry: Entry = {
            athlete_id: row.athlete_id,
            display_name: row.display_name,
            best_time_ms: Number(row.best_time_ms),
            rank: Number(row.rank),
            ...(row.club ? { club: row.club } : {}),
            ...(row.event_name ? { event_name: row.event_name } : {}),
          };
          if (row.gender === "M") results[category].M.push(entry);
          else if (row.gender === "F") results[category].F.push(entry);
        }
      } catch (err) {
        console.error(`[leaderboard] ERROR for category ${category}:`, err);
      }
    })
  );

  return Response.json({ ok: true, year, results });
}
