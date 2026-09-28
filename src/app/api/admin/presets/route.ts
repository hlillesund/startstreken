import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** GET /api/admin/presets — saved import overrides. */
export async function GET() {
  const presets = await prisma.import_presets.findMany({
    orderBy: { updated_at: "desc" },
    take: 200,
    include: { sources: { select: { slug: true } } },
  });
  return NextResponse.json(
    presets.map(({ sources, ...p }) => ({
      ...p,
      source_slug: sources.slug,
      start_date: p.start_date?.toISOString().slice(0, 10) ?? null,
    }))
  );
}

/** DELETE /api/admin/presets?id=… */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Mangler id" }, { status: 400 });
  await prisma.import_presets.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
