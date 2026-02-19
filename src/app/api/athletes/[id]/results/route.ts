import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Ctx) {
  const { id: athleteId } = await context.params;

  const rows = await prisma.$queryRaw<
    { start_date: string | null; event_name: string; race_name: string; time_ms: number }[]
  >`
    select
      e.start_date::text as start_date,
      e.name as event_name,
      r.name as race_name,
      res.time_ms
    from public.results res
    join public.races r on r.id = res.race_id
    join public.events e on e.id = r.event_id
    where res.athlete_id = ${athleteId}::uuid
    order by e.start_date desc nulls last, res.time_ms asc
  `;

  return Response.json(rows);
}