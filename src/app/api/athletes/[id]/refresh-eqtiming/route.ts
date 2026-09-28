// src/app/api/athletes/[id]/refresh-eqtiming/route.ts
import { prisma } from "@/lib/prisma";
import { importEqHistory } from "@/lib/import/eqtiming-history";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Pulls the athlete's EQ Timing history (called when a profile is opened).
 * Throttled per athlete inside importEqHistory, so repeated views are cheap.
 */
export async function POST(_req: Request, ctx: Ctx) {
  const { id: athleteId } = await ctx.params;

  const source = await prisma.sources.findUnique({ where: { slug: "eqtiming" } });
  if (!source) return Response.json({ error: "Missing source eqtiming" }, { status: 500 });

  // Only real EQ participant ids — "synt:" ids are our own hashes.
  const identities = await prisma.athlete_identities.findMany({
    where: { athlete_id: athleteId, source_id: source.id, NOT: { source_person_id: { startsWith: "synt:" } } },
    select: { source_person_id: true },
    take: 3,
  });
  if (!identities.length) {
    return Response.json(
      { error: "NO_EQTIMING_UID", message: "Utøveren er ikke koblet til EQTiming UID ennå." },
      { status: 400 }
    );
  }

  try {
    let inserted = 0;
    let throttled = true;
    for (const i of identities) {
      const res = await importEqHistory(athleteId, i.source_person_id);
      inserted += res.inserted;
      throttled &&= Boolean(res.throttled);
    }
    return Response.json({ ok: true, athleteId, inserted, throttled });
  } catch (e) {
    return Response.json(
      { error: "IMPORT_HISTORY_FAILED", message: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
