import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  if (!q) return Response.json([]);

  const rows = await prisma.$queryRaw<
    { id: string; display_name: string }[]
  >`
    select id, display_name
    from public.athletes
    where display_name_norm % ${q}
    order by similarity(display_name_norm, ${q}) desc
    limit 20
  `;

  return Response.json(rows);
}