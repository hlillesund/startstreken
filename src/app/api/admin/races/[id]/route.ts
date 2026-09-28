import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// PATCH /api/admin/races/:id — update race name or override distance_category
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { name, distance_category_override } = body;

  const data: Record<string, unknown> = {};
  if (name                       !== undefined) data.name                       = String(name).trim();
  if (distance_category_override !== undefined) data.distance_category_override = distance_category_override ?? null;

  await prisma.races.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}