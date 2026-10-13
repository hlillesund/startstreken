// src/app/api/plassering/route.ts
// «Hvor havner jeg?» — where a time places nationally, in the age class and in the biggest races.
import { getPlacement } from "@/lib/placement";
import { isSeasonCategory } from "@/lib/season";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const category = q.get("d") ?? "";
  const seconds = Number(q.get("t"));
  const g = q.get("g");
  const gender = g === "M" || g === "F" ? g : "A";
  const by = Number(q.get("f"));
  const now = new Date().getFullYear();
  const birthYear = Number.isInteger(by) && by > now - 110 && by < now - 4 ? by : null;

  if (!isSeasonCategory(category)) return Response.json({ ok: false, error: "INVALID_DISTANCE" }, { status: 400 });
  if (!Number.isFinite(seconds) || seconds < 60 || seconds > 12 * 3600) {
    return Response.json({ ok: false, error: "INVALID_TIME" }, { status: 400 });
  }

  try {
    const placement = await getPlacement(category, Math.round(seconds) * 1000, gender, birthYear, now);
    return Response.json({ ok: true, ...placement }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } });
  } catch (err) {
    console.error("[plassering] error:", err);
    return Response.json({ ok: false, error: "PLACEMENT_FAILED" }, { status: 500 });
  }
}
