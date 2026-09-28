import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { classifyRace, isDistanceCategory, sanitizeCategory } from "./distance";
import { fetchJson } from "./http";
import { upsertDiscovered } from "./crawler";
import { getSourceId } from "./persist";
import { NON_RUNNING_FEDERATION, NON_RUNNING_FEDERATION_SQL } from "./relevance";
import { MAX_TIME_MS, normKey } from "./text";

/** How often one athlete's EQ history may be re-fetched (it runs on profile views). */
const THROTTLE_MS = 12 * 3_600_000;

type EqHistoryItem = {
  HasResult?: boolean;
  WebPubliseres?: boolean;
  ArrangementUID?: number;
  ArrangementNavn?: string;
  ArrangementDato?: string;
  EtappeNavn?: string;
  Tid?: number;
  Plassering?: number | null;
  Forbund?: { Navn?: string } | null;
};

/**
 * Pulls one athlete's result history from EQ Timing (/api/Participant/Results) and
 * adds results for races that haven't been fully imported yet. Rows from full
 * event imports always win; those rows are never touched here. Stored rows keep
 * the raw EQ item (which contains ArrangementUID) — the profile API uses that to
 * know the race isn't fully imported.
 */
export async function importEqHistory(athleteId: string, uid: string, opts: { force?: boolean } = {}) {
  const sourceId = await getSourceId("eqtiming");
  const runKey = `uid:${uid}`;

  if (!opts.force) {
    const recent = await prisma.import_runs.findFirst({
      where: { source_id: sourceId, source_event_id: runKey, trigger: "history", started_at: { gt: new Date(Date.now() - THROTTLE_MS) } },
      select: { id: true },
    });
    if (recent) return { ok: true, throttled: true, inserted: 0 };
  }
  const run = await prisma.import_runs.create({
    data: { source_id: sourceId, source_event_id: runKey, trigger: "history", status: "started" },
    select: { id: true },
  });

  try {
    const payload = await fetchJson<EqHistoryItem[] | { Results?: EqHistoryItem[] }>(
      `https://live.eqtiming.com/api/Participant/Results?id=${encodeURIComponent(uid)}`
    );
    const items = Array.isArray(payload) ? payload : (payload?.Results ?? []);

    // Skiing, cycling, orienteering… are not running results. Drop any such rows an
    // earlier version stored for this athlete, and skip them from now on.
    await prisma.$executeRaw`
      DELETE FROM public.results
      WHERE athlete_id = ${athleteId}::uuid
        AND raw ? 'ArrangementUID'
        AND (raw->'Forbund'->>'Navn') ~* ${NON_RUNNING_FEDERATION_SQL}`;

    const rows = items
      .filter((it) => it?.HasResult && it?.WebPubliseres !== false)
      .filter((it) => !NON_RUNNING_FEDERATION.test(it.Forbund?.Navn ?? ""))
      .flatMap((it) => {
        if (!it.ArrangementUID || !it.ArrangementNavn || typeof it.Tid !== "number" || it.Tid <= 0 || it.Tid > MAX_TIME_MS) return [];
        const raceName = String(it.EtappeNavn ?? "Etappe");
        return [
          {
            it,
            sourceEventId: String(it.ArrangementUID),
            sourceRaceId: normKey(raceName),
            eventName: String(it.ArrangementNavn),
            date: it.ArrangementDato ? it.ArrangementDato.slice(0, 10) : null,
            raceName,
            timeMs: Math.floor(it.Tid / 1000) * 1000,
          },
        ];
      });

    if (!rows.length) {
      await prisma.import_runs.update({ where: { id: run.id }, data: { status: "ok", finished_at: new Date(), stats: { inserted: 0 } } });
      return { ok: true, inserted: 0 };
    }

    const eventIds = [...new Set(rows.map((r) => r.sourceEventId))];

    // History rows are a partial field (just this athlete). Queue each event for a
    // full import; events that already are fully imported are recognised and skipped.
    const seenEvents = new Map(rows.map((r) => [r.sourceEventId, r]));
    await upsertDiscovered(
      "eqtiming",
      [...seenEvents.values()].map((r) => ({
        source: "eqtiming" as const,
        sourceEventId: r.sourceEventId,
        name: r.eventName,
        date: r.date,
        location: null,
        country: null,
        sport: null,
        relevance: "running" as const,
        hasResults: true,
        meta: { fromHistory: true },
      }))
    ).catch((e) => console.error("[eq-history] queueing events failed:", e));
    const presets = await prisma.import_presets.findMany({
      where: { source_id: sourceId, source_event_id: { in: eventIds } },
      select: { source_event_id: true, source_race_id: true, distance_category: true },
    });
    const presetCat = (ev: string, race: string) => {
      const p =
        presets.find((x) => x.source_event_id === ev && x.source_race_id === race) ??
        presets.find((x) => x.source_event_id === ev && !x.source_race_id);
      return isDistanceCategory(p?.distance_category) ? p.distance_category : null;
    };

    // Events/races: create when missing, but never overwrite what's already there.
    const eventValues = new Map<string, Prisma.Sql>();
    for (const r of rows) {
      if (!eventValues.has(r.sourceEventId)) {
        eventValues.set(
          r.sourceEventId,
          Prisma.sql`(${sourceId}::uuid, ${r.sourceEventId}::text, ${r.eventName}::text, ${r.date}::date, now())`
        );
      }
    }
    await prisma.$executeRaw`
      INSERT INTO public.events (source_id, source_event_id, name, start_date, updated_at)
      VALUES ${Prisma.join([...eventValues.values()])}
      ON CONFLICT (source_id, source_event_id) DO UPDATE SET
        start_date = COALESCE(public.events.start_date, EXCLUDED.start_date)`;

    const events = await prisma.events.findMany({
      where: { source_id: sourceId, source_event_id: { in: eventIds } },
      select: { id: true, source_event_id: true },
    });
    const eventUuid = new Map(events.map((e) => [e.source_event_id, e.id]));

    const raceValues = new Map<string, Prisma.Sql>();
    for (const r of rows) {
      const ev = eventUuid.get(r.sourceEventId);
      const key = `${ev}|${r.sourceRaceId}`;
      if (ev && !raceValues.has(key)) {
        raceValues.set(key, Prisma.sql`(${ev}::uuid, ${r.sourceRaceId}::text, ${r.raceName}::text)`);
      }
    }
    await prisma.$executeRaw`
      INSERT INTO public.races (event_id, source_race_id, name)
      VALUES ${Prisma.join([...raceValues.values()])}
      ON CONFLICT (event_id, source_race_id) DO NOTHING`;

    const races = await prisma.races.findMany({
      where: { event_id: { in: [...eventUuid.values()] }, source_race_id: { in: [...new Set(rows.map((r) => r.sourceRaceId))] } },
      select: { id: true, event_id: true, source_race_id: true, distance_m: true, distance_category_override: true },
    });
    const raceOf = new Map(races.map((r) => [`${r.event_id}|${r.source_race_id}`, r]));

    // Replace this athlete's previous history rows; keep rows from full imports.
    const raceIds = races.map((r) => r.id);
    await prisma.results.deleteMany({
      where: { athlete_id: athleteId, race_id: { in: raceIds }, NOT: { raw: { path: ["source"], equals: "eqtiming" } } },
    });
    const fullyImported = new Set(
      (
        await prisma.results.findMany({
          where: { athlete_id: athleteId, race_id: { in: raceIds } },
          select: { race_id: true },
        })
      ).map((r) => r.race_id)
    );

    const data: Prisma.resultsCreateManyInput[] = [];
    for (const r of rows) {
      const race = raceOf.get(`${eventUuid.get(r.sourceEventId)}|${r.sourceRaceId}`);
      if (!race || fullyImported.has(race.id)) continue;
      const adminCat = isDistanceCategory(race.distance_category_override) ? race.distance_category_override : null;
      const category =
        adminCat ??
        presetCat(r.sourceEventId, r.sourceRaceId) ??
        classifyRace({ distanceM: race.distance_m, raceName: r.raceName, eventName: r.eventName }).category;
      data.push({
        race_id: race.id,
        athlete_id: athleteId,
        time_ms: r.timeMs,
        rank_overall: typeof r.it.Plassering === "number" ? r.it.Plassering : null,
        raw: r.it as Prisma.InputJsonValue,
        distance_category: sanitizeCategory(category, r.timeMs),
      });
    }
    const res = data.length ? await prisma.results.createMany({ data, skipDuplicates: true }) : { count: 0 };

    await prisma.import_runs.update({
      where: { id: run.id },
      data: { status: "ok", finished_at: new Date(), stats: { athleteId, inserted: res.count, items: items.length } },
    });
    return { ok: true, inserted: res.count };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await prisma.import_runs.update({ where: { id: run.id }, data: { status: "failed", finished_at: new Date(), error } });
    throw e;
  }
}
