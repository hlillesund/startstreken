// src/app/api/eqtiming/import-history/route.ts
import { prisma } from "@/lib/prisma";
import { fetchEqParticipantResults } from "@/lib/eqtiming";
import { Prisma } from "@prisma/client";

function normName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

type DistanceCategory = "5K" | "10K" | "HM" | "M" | "OTHER";

function classifyEqDistanceCategory(item: any): DistanceCategory | null {
  const et = String(item?.EtappeNavn ?? "").toLowerCase();

  // Halvmaraton først (fordi "halvmaraton" inneholder "maraton")
  if (et.includes("halv") || et.includes("half")) return "HM";

  // Maraton
  if (et.includes("maraton") || et.includes("marathon")) return "M";

  // 10 km
  if (/\b10\s*(km|k)\b/.test(et) || et.includes("10km") || et.includes("10 km")) return "10K";
  if (/\bmil(a|en)?\b/.test(et)) return "10K";

  // 5 km / 5000m
  if (/\b5\s*(km|k)\b/.test(et) || et.includes("5km") || et.includes("5 km") || /\b5000\b/.test(et))
    return "5K";

  return null;
}

// “åpenbart feil”-guardrails (kun de helt sikre)
function applySanity(category: DistanceCategory | null, timeMs: number, raceName: string): DistanceCategory | null {
  if (!category) return category;

  // Hvis vi allerede har HM fra navn, behold.
  const rn = raceName.toLowerCase();
  if (rn.includes("halv") || rn.includes("half")) return "HM";

  // Maraton under 1:50 er i praksis umulig → HM
  const ONE_H_50 = 1 * 3600_000 + 50 * 60_000; // 6_600_000
  if (category === "M" && timeMs > 0 && timeMs < ONE_H_50) return "HM";

  return category;
}

export async function POST(req: Request) {
  const tAll0 = Date.now();

  const body = await req.json().catch(() => ({}));
  const participantUid = String(body?.uid ?? "").trim();
  const displayName = String(body?.name ?? "").trim();

  if (!participantUid || !displayName) {
    return Response.json({ error: "Need uid + name" }, { status: 400 });
  }

  const source = await prisma.sources.findUnique({ where: { slug: "eqtiming" } });
  if (!source) {
    return Response.json({ error: "Missing sources row for eqtiming" }, { status: 500 });
  }

  // Upsert athlete (billig, 1 call)
  const athlete = await prisma.athletes.upsert({
    where: { display_name_norm: normName(displayName) },
    update: { display_name: displayName },
    create: { display_name: displayName, display_name_norm: normName(displayName) },
    select: { id: true, display_name: true },
  });

  // Upsert identity (billig, 1 call)
  await prisma.athlete_identities.upsert({
    where: {
      source_id_source_person_id: {
        source_id: source.id,
        source_person_id: participantUid,
      },
    },
    update: { athlete_id: athlete.id },
    create: {
      athlete_id: athlete.id,
      source_id: source.id,
      source_person_id: participantUid,
    },
  });

  // 1) Fetch EQTiming
  const tFetch0 = Date.now();
  const data = await fetchEqParticipantResults(participantUid);
  const items: any[] = Array.isArray(data) ? data : data?.Results ?? data?.results ?? [];
  const fetchMs = Date.now() - tFetch0;
console.log("eq fetch ms", fetchMs)


  // Filter relevante
  const rows = items
    .filter((it) => it?.HasResult && it?.WebPubliseres !== false)
    .map((it) => {
      const eventId = it?.ArrangementUID;
      const eventNameRaw = it?.ArrangementNavn;
      const dateStr = it?.ArrangementDato;

      const raceNameRaw = it?.EtappeNavn ?? "Etappe";
      const raceIdRaw = it?.EtappeUID;

      const timeMs = typeof it?.Tid === "number" ? it.Tid : null;

      if (!eventId || !eventNameRaw || !timeMs) return null;

      const sourceEventId = String(eventId);
      const sourceRaceId = String(raceIdRaw ?? raceNameRaw);

      return {
        it,
        sourceEventId,
        sourceRaceId,
        eventNameRaw: String(eventNameRaw),
        startDateRaw: dateStr ? new Date(dateStr) : null,
        raceNameRaw: String(raceNameRaw),
        timeMs,
      };
    })
    .filter(Boolean) as Array<{
    it: any;
    sourceEventId: string;
    sourceRaceId: string;
    eventNameRaw: string;
    startDateRaw: Date | null;
    raceNameRaw: string;
    timeMs: number;
  }>;

  if (rows.length === 0) {
    return Response.json({
      ok: true,
      athleteId: athlete.id,
      insertedOrUpdated: 0,
      skipped: items.length,
      timings: { fetchMs, totalMs: Date.now() - tAll0 },
    });
  }

  // 2) Batch-hent presets (race + event-only) i én query
  const eventIds = Array.from(new Set(rows.map((r) => r.sourceEventId)));
  const raceIds = Array.from(new Set(rows.map((r) => r.sourceRaceId)));

  const presets = await prisma.import_presets.findMany({
    where: {
      source_id: source.id,
      source_event_id: { in: eventIds },
      OR: [{ source_race_id: { in: raceIds } }, { source_race_id: null }],
    },
    select: {
      source_event_id: true,
      source_race_id: true,
      event_name: true,
      start_date: true,
      location: true,
      race_name: true,
      distance_m: true,
      distance_category: true,
    },
  });

  const presetRaceMap = new Map<string, (typeof presets)[number]>();
  const presetEventMap = new Map<string, (typeof presets)[number]>();

  for (const p of presets) {
    if (p.source_race_id == null) presetEventMap.set(p.source_event_id, p);
    else presetRaceMap.set(`${p.source_event_id}|${p.source_race_id}`, p);
  }

  function resolvePreset(sourceEventId: string, sourceRaceId: string) {
    return presetRaceMap.get(`${sourceEventId}|${sourceRaceId}`) ?? presetEventMap.get(sourceEventId) ?? null;
  }

  // 3) Bygg “canonical” event-data (én per sourceEventId)
  // preset vinner hvis finnes, ellers første forekomst
  const eventData = new Map<
    string,
    { source_event_id: string; name: string; start_date: Date | null; location: string | null }
  >();

  for (const r of rows) {
    const p = resolvePreset(r.sourceEventId, r.sourceRaceId);
    const name = p?.event_name ?? r.eventNameRaw;
    const start_date = p?.start_date ?? r.startDateRaw ?? null;
    const location = (p?.location ?? null) as string | null;

    if (!eventData.has(r.sourceEventId)) {
      eventData.set(r.sourceEventId, { source_event_id: r.sourceEventId, name, start_date, location });
    }
  }

  // 4) Batch UPSERT events via SQL (super-raskt)
  const tDb0 = Date.now();
  const eventValues = Array.from(eventData.values()).map((e) =>
    Prisma.sql`(${source.id}::uuid, ${e.source_event_id}::text, ${e.name}::text, ${e.start_date}::date, ${e.location}::text, now())`
  );

  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO public.events (source_id, source_event_id, name, start_date, location, updated_at)
      VALUES ${Prisma.join(eventValues)}
      ON CONFLICT (source_id, source_event_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        start_date = EXCLUDED.start_date,
        location = EXCLUDED.location,
        updated_at = EXCLUDED.updated_at;
    `
  );

  // 5) Hent event uuid-ids i én query
  const eventRows = await prisma.events.findMany({
    where: { source_id: source.id, source_event_id: { in: eventIds } },
    select: { id: true, source_event_id: true },
  });
  const eventIdMap = new Map(eventRows.map((e) => [e.source_event_id, e.id]));

  // 6) Bygg races (unik per (event_uuid, sourceRaceId))
  const raceData = new Map<
    string,
    { event_id: string; source_race_id: string; name: string; distance_m: number | null }
  >();

  for (const r of rows) {
    const event_uuid = eventIdMap.get(r.sourceEventId);
    if (!event_uuid) continue;

    const p = resolvePreset(r.sourceEventId, r.sourceRaceId);
    const name = p?.race_name ?? r.raceNameRaw;
    const distance_m = (p?.distance_m ?? null) as number | null;

    const key = `${event_uuid}|${r.sourceRaceId}`;
    if (!raceData.has(key)) raceData.set(key, { event_id: event_uuid, source_race_id: r.sourceRaceId, name, distance_m });
  }

  // 7) Batch UPSERT races via SQL
  const raceValues = Array.from(raceData.values()).map((rc) =>
    Prisma.sql`(${rc.event_id}::uuid, ${rc.source_race_id}::text, ${rc.name}::text, ${rc.distance_m}::int)`
  );

  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO public.races (event_id, source_race_id, name, distance_m)
      VALUES ${Prisma.join(raceValues)}
      ON CONFLICT (event_id, source_race_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        distance_m = EXCLUDED.distance_m;
    `
  );

  // 8) Hent race uuid-ids i én query
  const raceRows = await prisma.races.findMany({
    where: {
      event_id: { in: eventRows.map((e) => e.id) },
      source_race_id: { in: raceIds },
    },
    select: { id: true, event_id: true, source_race_id: true },
  });
  const raceIdMap = new Map(raceRows.map((rc) => [`${rc.event_id}|${rc.source_race_id}`, rc.id] as const));

  // 9) Bygg results rows med desired category (preset → inferred → sanity)
  const resultValues = rows
    .map((r) => {
      const event_uuid = eventIdMap.get(r.sourceEventId);
      if (!event_uuid) return null;

      const race_uuid = raceIdMap.get(`${event_uuid}|${r.sourceRaceId}`);
      if (!race_uuid) return null;

      const p = resolvePreset(r.sourceEventId, r.sourceRaceId);
      const inferred = classifyEqDistanceCategory(r.it);
      const desired = applySanity(
        (p?.distance_category ?? inferred ?? null) as DistanceCategory | null,
        r.timeMs,
        r.raceNameRaw
      );

      return Prisma.sql`(
        ${race_uuid}::uuid,
        ${athlete.id}::uuid,
        ${r.timeMs}::int,
        ${r.it?.Plassering ?? null}::int,
        ${r.it}::jsonb,
        ${desired}::text
      )`;
    })
    .filter(Boolean) as Prisma.Sql[];

  // 10) Batch UPSERT results via SQL (insert + update i ett)
  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO public.results (race_id, athlete_id, time_ms, rank_overall, raw, distance_category)
      VALUES ${Prisma.join(resultValues)}
      ON CONFLICT (race_id, athlete_id, time_ms)
      DO UPDATE SET
        rank_overall = EXCLUDED.rank_overall,
        raw = EXCLUDED.raw,
        distance_category = EXCLUDED.distance_category;
    `
  );

  const dbMs = Date.now() - tDb0;
  console.log("db ms", dbMs)

  return Response.json({
    ok: true,
    athleteId: athlete.id,
    insertedOrUpdated: resultValues.length,
    skipped: items.length - rows.length,
    timings: { fetchMs, dbMs, totalMs: Date.now() - tAll0 },
  });
}