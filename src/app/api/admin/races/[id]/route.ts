import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateLop } from "@/lib/lop/index";
import { classifyRace, isDistanceCategory, minPlausibleMs } from "@/lib/import/distance";

export const dynamic = "force-dynamic";

// PATCH /api/admin/races/:id — update race name or override distance_category.
// Rankings read results.distance_category, so an override is applied to the
// race's results too (and clearing it restores the automatic classification).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { name, distance_category_override } = body;

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = String(name).trim();
  if (distance_category_override !== undefined) {
    if (distance_category_override !== null && distance_category_override !== "" && !isDistanceCategory(distance_category_override)) {
      return NextResponse.json({ ok: false, error: "Ugyldig distansekategori" }, { status: 400 });
    }
    data.distance_category_override = distance_category_override || null;
  }

  const race = await prisma.races.update({
    where: { id },
    data,
    select: { name: true, distance_m: true, distance_category_override: true, events: { select: { name: true } } },
  });

  let resultsUpdated = 0;
  if (distance_category_override !== undefined) {
    const category = isDistanceCategory(race.distance_category_override)
      ? race.distance_category_override
      : classifyRace({ distanceM: race.distance_m, raceName: race.name, eventName: race.events.name }).category;
    const res = await prisma.results.updateMany({ where: { race_id: id }, data: { distance_category: category } });
    resultsUpdated = res.count;
    if (category !== "OTHER") {
      await prisma.results.updateMany({
        where: { race_id: id, time_ms: { lt: minPlausibleMs(category) } },
        data: { distance_category: "OTHER" },
      });
    }
  }

  invalidateLop();
  return NextResponse.json({ ok: true, resultsUpdated });
}
