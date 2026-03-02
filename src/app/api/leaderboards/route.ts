import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ALLOWED = new Set(["5K", "10K", "HM", "M"] as const);

function num(v: string | null, fallback: number) {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  // noen drivere kan gi string fra ::text
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const category = String(url.searchParams.get("category") ?? "HM").trim().toUpperCase();
  const year = num(url.searchParams.get("year"), new Date().getFullYear());
  const limit = Math.min(1000, Math.max(1, num(url.searchParams.get("limit"), 100)));

  if (!ALLOWED.has(category as any)) {
    return NextResponse.json({ ok: false, error: "INVALID_CATEGORY" }, { status: 400 });
  }
  if (!Number.isFinite(year) || year < 1900 || year > 3000) {
    return NextResponse.json({ ok: false, error: "INVALID_YEAR" }, { status: 400 });
  }

  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));

  const rowsRaw = await prisma.$queryRaw<
    {
      rank: unknown;
      athlete_id: string;
      display_name: string;
      birth_year: unknown;
      club: string | null;
      best_time_ms: unknown;
      best_date: string | null;
      best_event_name: string | null;
    }[]
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
        DENSE_RANK() OVER (ORDER BY best_time_ms ASC) AS rank
      FROM best
    ),
    picked AS (
      SELECT DISTINCT ON (r.athlete_id)
        r.athlete_id,
        r.time_ms,
        e.start_date,
        e.name AS event_name,
        r.club
      FROM results r
      JOIN races ra ON ra.id = r.race_id
      JOIN events e ON e.id = ra.event_id
      JOIN ranked rk ON rk.athlete_id = r.athlete_id AND rk.best_time_ms = r.time_ms
      WHERE r.distance_category = ${category}
        AND e.start_date >= ${from}
        AND e.start_date < ${to}
      ORDER BY r.athlete_id, e.start_date ASC NULLS LAST
    )
    SELECT
      rk.rank AS rank,
      rk.athlete_id::text AS athlete_id,
      a.display_name,
      a.birth_year AS birth_year,
      p.club,
      rk.best_time_ms AS best_time_ms,
      p.start_date::text AS best_date,
      p.event_name AS best_event_name
    FROM ranked rk
    JOIN athletes a ON a.id = rk.athlete_id
    LEFT JOIN picked p ON p.athlete_id = rk.athlete_id
    ORDER BY rk.rank ASC, a.display_name ASC
    LIMIT ${limit};
  `;

  // ✅ BigInt-safe mapping
  const rows = rowsRaw.map((r) => ({
    rank: toNum(r.rank) ?? 0,
    athlete_id: r.athlete_id,
    display_name: r.display_name,
    birth_year: toNum(r.birth_year),
    club: r.club ?? null,
    best_time_ms: toNum(r.best_time_ms) ?? 0,
    best_date: r.best_date ?? null,
    best_event_name: r.best_event_name ?? null,
  }));

  return NextResponse.json({ ok: true, category, year, limit, rows });
}