import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { classifyRace } from "./distance";
import { getSourceId, NoResultsError, persistEvent, type PersistSummary } from "./persist";
import { syncQueueAfterImport } from "./queue-state";
import { fetchEvent } from "./sources";
import { toDateOnly } from "./text";
import type { EventPreview, FetchOptions, ImportOverride, SourceSlug } from "./types";

export type ImportTrigger = "manual" | "reimport" | "cron" | "queue" | "cli";

export type ImportOutcome =
  | { status: "imported"; runId: string; summary: PersistSummary; durationMs: number }
  | { status: "no_results"; runId: string; message: string; warnings: string[]; durationMs: number }
  | { status: "failed"; runId: string; error: string; durationMs: number };

/**
 * Fetches one event from its source and writes it to the database. Every call is
 * logged in import_runs; the matching import_queue row (if any) is kept in sync.
 */
export async function importEvent(args: {
  source: SourceSlug;
  sourceEventId: string;
  trigger: ImportTrigger;
  options?: FetchOptions;
  override?: ImportOverride;
  /** Set by the queue when this is the scheduled follow-up import. */
  isRefresh?: boolean;
}): Promise<ImportOutcome> {
  const outcome = await runImport(args);
  const resolvedId = outcome.status === "imported" ? outcome.summary.sourceEventId : args.sourceEventId;
  await syncQueueAfterImport(args.source, resolvedId, outcome, { isRefresh: args.isRefresh }).catch((e) =>
    console.error("[import] queue sync failed:", e)
  );
  return outcome;
}

async function runImport(args: {
  source: SourceSlug;
  sourceEventId: string;
  trigger: ImportTrigger;
  options?: FetchOptions;
  override?: ImportOverride;
}): Promise<ImportOutcome> {
  const { source, sourceEventId, trigger } = args;
  const t0 = Date.now();
  const sourceId = await getSourceId(source);

  const queued = await prisma.import_queue.findUnique({
    where: { source_slug_source_event_id: { source_slug: source, source_event_id: sourceEventId } },
    select: { name: true, event_date: true },
  });
  const options: FetchOptions = {
    dateHint: queued?.event_date ? queued.event_date.toISOString().slice(0, 10) : null,
    nameHint: queued?.name ?? null,
    ...args.options,
  };

  const run = await prisma.import_runs.create({
    data: { source_id: sourceId, source_event_id: sourceEventId, status: "started", trigger },
    select: { id: true },
  });

  const finish = (data: Prisma.import_runsUpdateInput) =>
    prisma.import_runs.update({ where: { id: run.id }, data: { finished_at: new Date(), ...data } });

  let warnings: string[] = [];
  try {
    const normalized = await fetchEvent(source, sourceEventId, options);
    warnings = normalized.warnings;
    const summary = await persistEvent(normalized, args.override ?? {});
    const durationMs = Date.now() - t0;

    await finish({
      status: "ok",
      source_event_id: summary.sourceEventId,
      event_id: summary.eventId,
      stats: {
        eventName: summary.eventName,
        results: summary.results,
        races: summary.races,
        athletes: summary.athletes,
        source: normalized.stats ?? {},
        warnings: summary.warnings,
        durationMs,
      } as Prisma.InputJsonValue,
    });
    return { status: "imported", runId: run.id, summary, durationMs };
  } catch (e) {
    const durationMs = Date.now() - t0;
    if (e instanceof NoResultsError) {
      await finish({ status: "no_results", error: e.message, stats: { eventName: options.nameHint, warnings, durationMs } });
      return { status: "no_results", runId: run.id, message: e.message, warnings, durationMs };
    }
    const error = e instanceof Error ? e.message : String(e);
    console.error(`[import] ${source}/${sourceEventId} failed:`, e);
    await finish({ status: "failed", error: error.slice(0, 2000), stats: { durationMs } }).catch(() => {});
    return { status: "failed", runId: run.id, error, durationMs };
  }
}

/** Fetches and parses an event without writing anything — for the admin preview. */
export async function previewEvent(source: SourceSlug, sourceEventId: string, options: FetchOptions = {}): Promise<EventPreview> {
  const queued = await prisma.import_queue
    .findUnique({
      where: { source_slug_source_event_id: { source_slug: source, source_event_id: sourceEventId } },
      select: { event_date: true },
    })
    .catch(() => null);
  const ev = await fetchEvent(source, sourceEventId, options);
  return {
    source,
    sourceEventId,
    name: ev.name,
    date: ev.date ?? (queued?.event_date ? queued.event_date.toISOString().slice(0, 10) : null),
    location: ev.location,
    url: ev.url,
    warnings: ev.warnings,
    races: ev.races.map((r) => {
      const c = classifyRace({ distanceM: r.distanceM, raceName: r.name, eventName: ev.name, nonRoad: r.nonRoad });
      return { sourceRaceId: r.sourceRaceId, name: r.name, distanceM: c.distanceM, category: c.category, finishers: r.results.length };
    }),
  };
}

/** Stores event-level overrides so later (automatic) re-imports keep applying them. */
export async function saveEventPreset(source: SourceSlug, sourceEventId: string, o: ImportOverride) {
  const sourceId = await getSourceId(source);
  const data = {
    event_name: o.event_name || null,
    start_date: toDateOnly(o.start_date),
    location: o.location || null,
    race_name: o.race_name || null,
    distance_m: o.distance_m ?? null,
    distance_category: o.distance_category ?? null,
    updated_at: new Date(),
  };
  const existing = await prisma.import_presets.findFirst({
    where: { source_id: sourceId, source_event_id: sourceEventId, OR: [{ source_race_id: null }, { source_race_id: "" }] },
    select: { id: true },
  });
  if (existing) await prisma.import_presets.update({ where: { id: existing.id }, data });
  else await prisma.import_presets.create({ data: { ...data, source_id: sourceId, source_event_id: sourceEventId } });
}
