import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/admin/events/:id — full detail for editing
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ev = await prisma.events.findUnique({
    where: { id },
    include: {
      event_series: true,
      races: {
        include: {
          _count: { select: { results: true } },
          results: {
            select: { distance_category: true },
            distinct: ["distance_category"],
            where: { distance_category: { not: null } },
          },
        },
        orderBy: { name: "asc" },
      },
    },
  });

  if (!ev) return NextResponse.json({ ok: false }, { status: 404 });

  return NextResponse.json({
    ok: true,
    event: {
      id:              ev.id,
      name:            ev.name,
      source_event_id: ev.source_event_id,
      start_date:      ev.start_date?.toISOString().split("T")[0] ?? null,
      location:        ev.location,
      pretty_url:      ev.pretty_url,
      series:          ev.event_series ?? null,
      races: ev.races.map((r) => ({
        id:                          r.id,
        name:                        r.name,
        distance_category_override:  r.distance_category_override,
        inferred_distances: [...new Set(r.results.map((x) => x.distance_category).filter(Boolean))],
        result_count:                r._count.results,
      })),
    },
  });
}

// PATCH /api/admin/events/:id — update event fields
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { name, start_date, location, pretty_url, series_id } = body;

  const data: Record<string, unknown> = {};
  if (name       !== undefined) data.name       = String(name).trim();
  if (location   !== undefined) data.location   = location ? String(location).trim() : null;
  if (pretty_url !== undefined) data.pretty_url = pretty_url ? String(pretty_url).trim() : null;
  if (start_date !== undefined) data.start_date = start_date ? new Date(start_date) : null;

  // series_id: null = unlink, undefined = don't touch, string = link
  if (series_id !== undefined) {
    data.series_id = series_id === null ? null : String(series_id);
  }

  const updated = await prisma.events.update({
    where: { id },
    data,
  });

  return NextResponse.json({ ok: true, id: updated.id });
}