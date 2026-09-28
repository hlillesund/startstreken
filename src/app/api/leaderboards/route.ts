// src/app/api/leaderboards/route.ts
import { prisma } from "@/lib/prisma";

const ALLOWED_CATEGORIES = ["5K", "10K", "HM", "M"] as const;

type LeaderRow = {
  athlete_id: string;
  display_name: string;
  gender: string;
  best_time_ms: bigint;
  rank: bigint;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const yearStr = String(url.searchParams.get("year") ?? new Date().getFullYear());
  const year = Number(yearStr);

  if (!Number.isFinite(year) || year < 1900 || year > 3000) {
    return Response.json({ ok: false, error: "INVALID_YEAR" }, { status: 400 });
  }

  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));

  console.log("[leaderboard] year:", year, "from:", from, "to:", to);

  const results: Record<string, { M: any[]; F: any[] }> = {};

  for (const category of ALLOWED_CATEGORIES) {
    try {
      const rows = await prisma.$queryRaw<LeaderRow[]>`
        WITH best AS (
          SELECT
            r.athlete_id,
            a.display_name,
            a.gender,
            MIN(r.time_ms) AS best_time_ms
          FROM results r
          JOIN races ra ON ra.id = r.race_id
          JOIN events e ON e.id = ra.event_id
          JOIN athletes a ON a.id = r.athlete_id
          WHERE r.distance_category = ${category}
            AND e.start_date >= ${from}
            AND e.start_date < ${to}
            AND a.gender IN ('M', 'F')
          GROUP BY r.athlete_id, a.display_name, a.gender
        ),
        ranked AS (
          SELECT
            athlete_id,
            display_name,
            gender,
            best_time_ms,
            DENSE_RANK() OVER (PARTITION BY gender ORDER BY best_time_ms ASC) AS rank
          FROM best
        )
        SELECT
          athlete_id::text,
          display_name,
          gender,
          best_time_ms::bigint,
          rank
        FROM ranked
        WHERE rank <= 5
        ORDER BY gender, rank;
      `;

      console.log(`[leaderboard] ${category}: ${rows.length} rows`, rows[0] ?? "empty");

      results[category] = { M: [], F: [] };

      for (const row of rows) {
        const entry = {
          athlete_id: row.athlete_id,
          display_name: row.display_name,
          best_time_ms: Number(row.best_time_ms),
          rank: Number(row.rank),
        };
        if (row.gender === "M") results[category].M.push(entry);
        else if (row.gender === "F") results[category].F.push(entry);
      }
    } catch (err) {
      console.error(`[leaderboard] ERROR for category ${category}:`, err);
      results[category] = { M: [], F: [] };
    }
  }

  console.log("[leaderboard] final results keys:", Object.keys(results));

  return Response.json({ ok: true, year, results });
}