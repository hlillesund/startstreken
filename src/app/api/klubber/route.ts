// src/app/api/klubber/route.ts
// The clubs with the most runners this season (front page).
import { getClubs } from "@/lib/clubs";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const now = new Date().getFullYear();
  const y = Number(q.get("year") ?? now);
  const year = Number.isInteger(y) && y >= 2000 && y <= now ? y : now;
  const limit = Math.min(50, Math.max(1, Number(q.get("limit")) || 6));
  try {
    const clubs = (await getClubs(year)).slice(0, limit).map(({ slug, name, runners, results }) => ({ slug, name, runners, results }));
    return Response.json({ ok: true, year, clubs }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } });
  } catch (err) {
    console.error("[klubber] error:", err);
    return Response.json({ ok: false, error: "CLUBS_FAILED" }, { status: 500 });
  }
}
