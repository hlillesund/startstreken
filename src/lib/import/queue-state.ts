import { prisma } from "@/lib/prisma";
import { addDays, osloToday, toDateOnly } from "./text";
import type { ImportOutcome } from "./run";
import type { SourceSlug } from "./types";

/** Queue tuning. */
export const QUEUE = {
  /** Re-import once this long after the first import, to catch corrected results. */
  refreshAfterDays: 3,
  /** Only schedule that refresh for events this recent. */
  refreshWindowDays: 7,
  /** How often to look again when a source has no results yet. */
  waitingRetryHours: 12,
  /** Stop looking for results this long after the event date. */
  giveUpAfterDays: 21,
  /** Consecutive errors before an item is marked failed. */
  maxErrors: 5,
  /** A lock older than this is assumed to belong to a crashed run. */
  staleLockMinutes: 15,
};

const hours = (h: number) => new Date(Date.now() + h * 3_600_000);

/**
 * Updates (or, for manual imports, creates) the queue row after an import so the
 * crawler knows what's done, what to retry and when to refresh.
 */
export async function syncQueueAfterImport(
  source: SourceSlug,
  sourceEventId: string,
  outcome: ImportOutcome,
  opts: { isRefresh?: boolean } = {}
) {
  const key = { source_slug_source_event_id: { source_slug: source, source_event_id: sourceEventId } };
  const row = await prisma.import_queue.findUnique({ where: key });
  const today = toDateOnly(osloToday())!;

  if (outcome.status === "imported") {
    const { summary } = outcome;
    const eventDate = row?.event_date ?? toDateOnly(summary.eventDate);
    const recent = eventDate ? eventDate >= addDays(today, -QUEUE.refreshWindowDays) : false;
    const refresh_at = !opts.isRefresh && recent && !row?.imported_at ? addDays(new Date(), QUEUE.refreshAfterDays) : null;
    const data = {
      status: "imported",
      event_id: summary.eventId,
      result_count: summary.results,
      imported_at: new Date(),
      refresh_at,
      attempts: 0,
      last_error: summary.warnings.length ? summary.warnings.join("\n").slice(0, 2000) : null,
      locked_at: null,
      updated_at: new Date(),
    };
    if (row) await prisma.import_queue.update({ where: key, data });
    else
      await prisma.import_queue.create({
        data: {
          ...data,
          source_slug: source,
          source_event_id: sourceEventId,
          name: summary.eventName,
          event_date: eventDate,
          relevance: "running",
          approved: true,
        },
      });
    return;
  }

  if (!row) return;
  const alreadyImported = Boolean(row.event_id && row.imported_at);

  if (outcome.status === "no_results") {
    const tooOld = row.event_date ? row.event_date < addDays(today, -QUEUE.giveUpAfterDays) : row.attempts > 10;
    await prisma.import_queue.update({
      where: key,
      data: alreadyImported
        ? { locked_at: null, refresh_at: null, updated_at: new Date() }
        : {
            status: tooOld ? "no_results" : "waiting",
            next_attempt_at: hours(QUEUE.waitingRetryHours),
            last_error: outcome.message,
            locked_at: null,
            updated_at: new Date(),
          },
    });
    return;
  }

  const attempts = row.attempts + 1;
  await prisma.import_queue.update({
    where: key,
    data: alreadyImported
      ? { locked_at: null, refresh_at: null, last_error: outcome.error.slice(0, 2000), updated_at: new Date() }
      : {
          status: attempts >= QUEUE.maxErrors ? "failed" : "pending",
          attempts,
          last_error: outcome.error.slice(0, 2000),
          next_attempt_at: hours(2 ** attempts),
          locked_at: null,
          updated_at: new Date(),
        },
  });
}
