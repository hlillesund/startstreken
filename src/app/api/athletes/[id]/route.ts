import { prisma } from "@/lib/prisma";
import { mergedInto } from "@/lib/dedupe/merge";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const select = { id: true, display_name: true, birth_year: true, gender: true } as const;
  let athlete = await prisma.athletes.findUnique({ where: { id }, select });
  if (!athlete && /^[0-9a-f-]{36}$/i.test(id)) {
    // merged into another profile: old links lead there
    const target = await mergedInto(id);
    if (target) athlete = await prisma.athletes.findUnique({ where: { id: target }, select });
  }
  if (!athlete) return Response.json(null, { status: 404 });
  return Response.json(athlete);
}