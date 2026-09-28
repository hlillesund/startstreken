import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  const series = await prisma.event_series.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : {},
    orderBy: { name: "asc" },
    include: {
      _count: { select: { events: true } },
    },
  });

  return NextResponse.json(
    series.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      location: s.location,
      notes: s.notes,
      edition_count: s._count.events,
    }))
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const location = typeof body.location === "string" ? body.location.trim() : null;
    const notes = typeof body.notes === "string" ? body.notes.trim() : null;

    if (!name) {
      return NextResponse.json(
        { ok: false, error: "name is required" },
        { status: 400 }
      );
    }

    const base = slugify(name);
    let slug = base;
    let n = 1;

    while (await prisma.event_series.findUnique({ where: { slug } })) {
      slug = `${base}-${++n}`;
    }

    const series = await prisma.event_series.create({
      data: {
        name,
        slug,
        location: location || null,
        notes: notes || null,
      },
    });

    return NextResponse.json({ ok: true, series }, { status: 201 });
  } catch (err) {
    console.error("Failed to create series:", err);

    return NextResponse.json(
      { ok: false, error: "Failed to create series" },
      { status: 500 }
    );
  }
}