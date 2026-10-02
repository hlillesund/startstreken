// src/app/api/leaderboards/route.ts
import { getLeaderboards } from "@/lib/season";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("year") ?? new Date().getFullYear());
  const limit = Math.min(10, Math.max(1, Number(url.searchParams.get("limit") ?? 5) || 5));

  if (!Number.isInteger(year) || year < 1900 || year > 3000) {
    return Response.json({ ok: false, error: "INVALID_YEAR" }, { status: 400 });
  }

  try {
    const lists = await getLeaderboards(year, limit);
    const results = Object.fromEntries(
      Object.entries(lists).map(([cat, { M, F }]) => [
        cat,
        {
          M: M.map(({ athlete_id, display_name, best_time_ms, rank, club, event_name }) => ({ athlete_id, display_name, best_time_ms, rank, club: club ?? undefined, event_name: event_name ?? undefined })),
          F: F.map(({ athlete_id, display_name, best_time_ms, rank, club, event_name }) => ({ athlete_id, display_name, best_time_ms, rank, club: club ?? undefined, event_name: event_name ?? undefined })),
        },
      ])
    );
    return Response.json(
      { ok: true, year, results },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } }
    );
  } catch (err) {
    console.error("[leaderboard] error:", err);
    return Response.json({ ok: false, error: "LEADERBOARD_FAILED" }, { status: 500 });
  }
}
