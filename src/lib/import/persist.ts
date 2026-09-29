import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { touchLop } from "@/lib/lop/index";
import { resolveAthletes, type ResolveStats } from "./athletes";
import { classifyRace, isDistanceCategory, isParaClass, sanitizeCategory, type DistanceCategory } from "./distance";
import { fixDayOffset, isoDate, MAX_TIME_MS, toDateOnly } from "./text";
import { SOURCE_LABELS, type ImportOverride, type NormalizedEvent } from "./types";

export type PersistSummary = {
  eventId: string;
  /** The source's own id for the event (may differ from what was asked for, e.g. slug → UUID). */
  sourceEventId: string;
  eventName: string;
  eventDate: string | null;
  races: { id: string; sourceRaceId: string; name: string; category: DistanceCategory; distanceM: number | null; results: number }[];
  results: number;
  athletes: ResolveStats;
  warnings: string[];
};

const PLACEHOLDER_NAME = /^((EQTiming|Ultimate|RaceResult) event \d+|Racedays [0-9a-f]{8})$/i;
/** Race names older importers used when they didn't know better — safe to replace. */
const PLACEHOLDER_RACE = /^(5K|10K|HM|M|OTHER|Distance \d+|Distanse \d+|Class \d+)$/i;
const INSERT_CHUNK = 1000;

export async function getSourceId(slug: string): Promise<string> {
  const row = await prisma.sources.findUnique({ where: { slug }, select: { id: true } });
  if (!row) throw new Error(`Mangler rad i sources for "${slug}" — kjør SQL-migreringen i prisma/sql/`);
  return row.id;
}

/** Competition ranking ("1224"): ties share a rank, the next rank skips. */
function assignRanks<T>(items: T[], timeOf: (t: T) => number, set: (t: T, rank: number) => void) {
  let prevTime = -1;
  let prevRank = 0;
  items.forEach((it, i) => {
    const t = timeOf(it);
    const rank = t === prevTime ? prevRank : i + 1;
    set(it, rank);
    prevTime = t;
    prevRank = rank;
  });
}

/**
 * Writes a normalised event: event row, race rows, athletes/identities and the
 * complete result list for every race (replacing what was there). Admin edits
 * (event name/date/location, race names, distance overrides) are preserved;
 * presets and explicit overrides win over source data.
 */
export async function persistEvent(ev: NormalizedEvent, override: ImportOverride = {}): Promise<PersistSummary> {
  const warnings = [...ev.warnings];
  const races = ev.races.filter((r) => r.results.length > 0);
  if (races.length === 0) throw new NoResultsError("Ingen resultater funnet hos kilden");

  const sourceId = await getSourceId(ev.source);

  const presets = await prisma.import_presets.findMany({
    where: { source_id: sourceId, source_event_id: ev.sourceEventId },
  });
  const eventPreset = presets.find((p) => !p.source_race_id) ?? null;
  const racePreset = new Map(presets.filter((p) => p.source_race_id).map((p) => [p.source_race_id as string, p]));

  /* ── Event ── */
  const existing = await prisma.events.findUnique({
    where: { source_id_source_event_id: { source_id: sourceId, source_event_id: ev.sourceEventId } },
    select: { id: true, name: true, start_date: true, location: true },
  });
  const keepName = existing && !PLACEHOLDER_NAME.test(existing.name) ? existing.name : null;
  const name =
    override.event_name ||
    eventPreset?.event_name ||
    keepName ||
    ev.name ||
    `${SOURCE_LABELS[ev.source]} event ${ev.sourceEventId}`;
  const startDate =
    toDateOnly(override.start_date) ?? eventPreset?.start_date ?? existing?.start_date ?? toDateOnly(ev.date);
  const location = override.location || eventPreset?.location || existing?.location || ev.location || null;

  const event = await prisma.events.upsert({
    where: { source_id_source_event_id: { source_id: sourceId, source_event_id: ev.sourceEventId } },
    create: {
      source_id: sourceId,
      source_event_id: ev.sourceEventId,
      name,
      start_date: startDate,
      location,
      updated_at: new Date(),
    },
    update: { name, start_date: startDate, location, updated_at: new Date() },
    select: { id: true },
  });

  /* ── Races ── */
  const existingRaces = await prisma.races.findMany({
    where: { event_id: event.id },
    select: { id: true, source_race_id: true, name: true, distance_m: true, distance_category_override: true },
  });
  const existingByKey = new Map(existingRaces.map((r) => [r.source_race_id ?? "", r]));
  // Race-level manual overrides only make sense when there is a single race.
  const raceOverride = races.length === 1 ? override : {};

  const raceRows = [];
  for (const r of races) {
    const prev = existingByKey.get(r.sourceRaceId);
    // Race-level fields of an event-wide preset only apply when there is one race.
    const preset = racePreset.get(r.sourceRaceId) ?? (races.length === 1 ? eventPreset : null);
    const classified = classifyRace({
      distanceM: raceOverride.distance_m ?? preset?.distance_m ?? r.distanceM ?? prev?.distance_m,
      raceName: r.name,
      eventName: ev.name ?? name,
      nonRoad: r.nonRoad,
    });
    const presetCat = isDistanceCategory(preset?.distance_category) ? preset.distance_category : null;
    const adminCat = isDistanceCategory(prev?.distance_category_override) ? prev.distance_category_override : null;
    const category: DistanceCategory =
      raceOverride.distance_category ?? adminCat ?? presetCat ?? classified.category;

    const raceName =
      raceOverride.race_name ||
      (racePreset.get(r.sourceRaceId)?.race_name ?? null) ||
      (prev?.name && !PLACEHOLDER_RACE.test(prev.name) ? prev.name : null) ||
      r.name;

    const row = await prisma.races.upsert({
      where: { event_id_source_race_id: { event_id: event.id, source_race_id: r.sourceRaceId } },
      create: { event_id: event.id, source_race_id: r.sourceRaceId, name: raceName, distance_m: classified.distanceM },
      update: { name: raceName, distance_m: classified.distanceM },
      select: { id: true },
    });
    raceRows.push({ race: r, id: row.id, name: raceName, category, distanceM: classified.distanceM });
  }

  // Races an earlier import created for what the source now says are laps/splits.
  const notRaces = new Set(ev.notRaces ?? []);
  const bogus = existingRaces.filter((r) => r.source_race_id && notRaces.has(r.source_race_id));
  if (bogus.length) {
    await prisma.races.deleteMany({ where: { id: { in: bogus.map((r) => r.id) } } });
    warnings.push(`Fjernet ${bogus.length} «løp» som ikke er egne løp (mellomtider/stafett): ${bogus.map((r) => r.name).join(", ")}`);
  }

  const touched = new Set(races.map((r) => r.sourceRaceId));
  const stale = existingRaces.filter((r) => !touched.has(r.source_race_id ?? "") && !notRaces.has(r.source_race_id ?? ""));
  if (stale.length) {
    warnings.push(
      `${stale.length} eldre løp under eventet ble ikke berørt av importen: ${stale.map((r) => r.name).join(", ")}`
    );
  }

  /* ── Athletes ── */
  const { map: people, stats: athleteStats } = await resolveAthletes(
    sourceId,
    races.flatMap((r) =>
      r.results.map((x) => ({ personKey: x.personKey, name: x.name, gender: x.gender, birthYear: x.birthYear }))
    )
  );

  /* ── Results (one transaction per race: delete + insert) ── */
  let total = 0;
  const summaryRaces: PersistSummary["races"] = [];

  for (const { race, id: raceId, name: raceName, category, distanceM } of raceRows) {
    const offset = fixDayOffset(race.results.map((x) => x.timeMs));
    if (offset) {
      warnings.push(`${race.name}: tidene hadde en forskyvning på ${offset / 86_400_000} døgn hos kilden — korrigert`);
      for (const x of race.results) x.timeMs -= offset;
    }
    const seen = new Set<string>();
    const rows: { data: Prisma.resultsCreateManyInput; gender: "M" | "F" | null; sourceRank: number | null; para: boolean }[] = [];

    for (const x of [...race.results].sort((a, b) => a.timeMs - b.timeMs)) {
      const person = people.get(x.personKey);
      if (!person || !(x.timeMs > 0 && x.timeMs <= MAX_TIME_MS)) continue;
      const dedupe = `${person.athleteId}|${x.timeMs}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      const para = Boolean(x.para) || isParaClass(x.className);
      rows.push({
        data: {
          race_id: raceId,
          athlete_id: person.athleteId,
          time_ms: x.timeMs,
          rank_overall: null,
          rank_gender: null,
          bib: x.bib,
          club: x.club,
          // Para results stay on the athlete's profile but out of the distance rankings.
          distance_category: para ? "OTHER" : sanitizeCategory(category, x.timeMs),
          raw: (para ? { ...x.raw, para: true } : x.raw) as Prisma.InputJsonValue,
        },
        gender: person.gender ?? x.gender,
        sourceRank: x.sourceRank,
        para,
      });
    }

    if (ev.partialField) {
      // Only part of the field was imported, so our own ranks would be misleading.
      for (const r of rows) r.data.rank_overall = r.sourceRank;
    } else {
      // Places are for the open field, as in the organisers' own lists; para athletes get none.
      const open = rows.filter((r) => !r.para);
      assignRanks(open, (r) => r.data.time_ms, (r, rank) => (r.data.rank_overall = rank));
      for (const g of ["M", "F"] as const) {
        assignRanks(
          open.filter((r) => r.gender === g),
          (r) => r.data.time_ms,
          (r, rank) => (r.data.rank_gender = rank)
        );
      }
    }
    const data = rows.map((r) => r.data);

    await prisma.$transaction(
      async (tx) => {
        await tx.results.deleteMany({ where: { race_id: raceId } });
        for (let i = 0; i < data.length; i += INSERT_CHUNK) {
          await tx.results.createMany({ data: data.slice(i, i + INSERT_CHUNK), skipDuplicates: true });
        }
      },
      { timeout: 120_000, maxWait: 15_000 }
    );

    total += data.length;
    summaryRaces.push({ id: raceId, sourceRaceId: race.sourceRaceId, name: raceName, category, distanceM, results: data.length });
  }

  touchLop();
  return {
    eventId: event.id,
    sourceEventId: ev.sourceEventId,
    eventName: name,
    eventDate: isoDate(startDate),
    races: summaryRaces,
    results: total,
    athletes: athleteStats,
    warnings,
  };
}

export class NoResultsError extends Error {}
