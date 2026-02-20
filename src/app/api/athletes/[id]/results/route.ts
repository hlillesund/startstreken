import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, context: Ctx) {
  const { id: athleteId } = await context.params;

  const rows = await prisma.$queryRaw<
    {
      start_date: string | null;
      event_name: string;
      race_name: string;
      time_ms: number;
      club: string | null;
      distance_category: string | null;
    }[]
  >`
    select
      e.start_date,
      e.name as event_name,
      ra.name as race_name,
      r.time_ms,
      r.club,
      r.distance_category
    from public.results r
    join public.races ra on ra.id = r.race_id
    join public.events e on e.id = ra.event_id
    where r.athlete_id = ${athleteId}::uuid
    order by e.start_date desc nulls last
  `;

  return Response.json(rows);
}