import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/admin/series/:id — full series with all linked editions
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const series = await prisma.event_series.findUnique({
    where: { id },
    include: {
      events: {
        orderBy: { start_date: "desc" },
        include: {
          races: {
            select: {
              id: true,
              name: true,
              distance_category_override: true,
              _count: { select: { results: true } },
              results: {
                select: { distance_category: true },
                distinct: ["distance_category"],
                where: { distance_category: { not: null } },
              },
            },
          },
        },
      },
    },
  });

  if (!series) return NextResponse.json({ ok: false }, { status: 404 });

  return NextResponse.json({
    ok: true,
    series: {
      id:       series.id,
      name:     series.name,
      slug:     series.slug,
      location: series.location,
      notes:    series.notes,
      editions: series.events.map((ev) => {
        const distances = new Set<string>();
        let resultCount = 0;
        for (const r of ev.races) {
          resultCount += r._count.results;
          const d = r.distance_category_override ?? r.results[0]?.distance_category;
          if (d) distances.add(d);
        }
        return {
          id:           ev.id,
          name:         ev.name,
          start_date:   ev.start_date?.toISOString().split("T")[0] ?? null,
          location:     ev.location,
          race_count:   ev.races.length,
          result_count: resultCount,
          distances:    [...distances].sort(),
        };
      }),
    },
  });
}

// PATCH /api/admin/series/:id — update series metadata
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { name, location, notes } = body;

  const data: Record<string, unknown> = {};
  if (name     !== undefined) data.name     = String(name).trim();
  if (location !== undefined) data.location = location ? String(location).trim() : null;
  if (notes    !== undefined) data.notes    = notes    ? String(notes).trim()    : null;

  await prisma.event_series.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/series/:id — delete series (unlinks events, doesn't delete them)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.events.updateMany({
    where: { series_id: id },
    data:  { series_id: null },
  });
  await prisma.event_series.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}