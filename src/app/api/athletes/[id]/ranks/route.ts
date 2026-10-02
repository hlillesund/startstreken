// src/app/api/athletes/[id]/ranks/route.ts
// National rank per distance for one athlete and year, in a single request.
import { getAthleteRanks } from "@/lib/season";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const year = Number(new URL(req.url).searchParams.get("year") ?? new Date().getFullYear());

  if (!isUuid(id)) return Response.json({ ok: false, error: "INVALID_ATHLETE_ID" }, { status: 400 });
  if (!Number.isInteger(year) || year < 1900 || year > 3000) {
    return Response.json({ ok: false, error: "INVALID_YEAR" }, { status: 400 });
  }

  try {
    const ranks = await getAthleteRanks(id, year);
    return Response.json(
      { ok: true, year, ranks },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } }
    );
  } catch (err) {
    console.error("[athlete ranks] error:", err);
    return Response.json({ ok: false, error: "RANKS_FAILED" }, { status: 500 });
  }
}
