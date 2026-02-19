import { prisma } from "@/lib/prisma";
import { fetchEqParticipantResults } from "@/lib/eqtiming";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_: Request, context: Ctx) {
  const { id: athleteId } = await context.params;

  const source = await prisma.sources.findUnique({ where: { slug: "eqtiming" } });
  if (!source) return Response.json({ error: "Missing source eqtiming" }, { status: 500 });

  const identity = await prisma.athlete_identities.findFirst({
    where: { athlete_id: athleteId, source_id: source.id },
  });

  if (!identity) {
    return Response.json(
      { error: "NO_EQTIMING_UID", message: "Utøveren er ikke koblet til EQTiming UID ennå." },
      { status: 400 }
    );
  }

  const uid = identity.source_person_id;

  const data = await fetchEqParticipantResults(uid);
  const items = Array.isArray(data) ? data : (data?.Results ?? data?.results ?? []);

  let inserted = 0;

  for (const item of items) {
    if (!item?.HasResult) continue;
    if (item?.WebPubliseres === false) continue;

    const eventId = item?.ArrangementUID;
    const eventName = item?.ArrangementNavn;
    const dateStr = item?.ArrangementDato;

    const raceId = item?.EtappeUID;
    const raceName = item?.EtappeNavn ?? "Etappe";

    const timeMs = typeof item?.Tid === "number" ? item.Tid : null;
    if (!eventId || !eventName || !timeMs) continue;

    const startDate = dateStr ? new Date(dateStr) : null;

    const eventRow = await prisma.events.upsert({
      where: {
        source_id_source_event_id: { source_id: source.id, source_event_id: String(eventId) },
      },
      update: { name: String(eventName), start_date: startDate, updated_at: new Date() },
      create: {
        source_id: source.id,
        source_event_id: String(eventId),
        name: String(eventName),
        start_date: startDate,
        updated_at: new Date(),
      },
    });

    const raceRow = await prisma.races.upsert({
      where: {
        event_id_source_race_id: { event_id: eventRow.id, source_race_id: String(raceId ?? raceName) },
      },
      update: { name: String(raceName) },
      create: {
        event_id: eventRow.id,
        source_race_id: String(raceId ?? raceName),
        name: String(raceName),
        distance_m: null,
      },
    });

    await prisma.results.upsert({
      where: {
        race_id_athlete_id_time_ms: { race_id: raceRow.id, athlete_id: athleteId, time_ms: timeMs },
      },
      update: { rank_overall: item?.Plassering ?? null, raw: item },
      create: {
        race_id: raceRow.id,
        athlete_id: athleteId,
        time_ms: timeMs,
        rank_overall: item?.Plassering ?? null,
        raw: item,
      },
    });

    inserted++;
  }

  return Response.json({ ok: true, athleteId, inserted });
}