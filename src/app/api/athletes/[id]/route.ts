import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const athlete = await prisma.athletes.findUnique({
    where: { id },
    select: { id: true, display_name: true, birth_year: true, gender: true },
  });
  if (!athlete) return Response.json(null, { status: 404 });
  return Response.json(athlete);
}