import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { importEvent, type ImportTrigger } from "./run";
import { QUEUE } from "./queue-state";
import { discover } from "./sources";
import { addDays, isoDate, osloToday, toDateOnly } from "./text";
import { CRAWL_SOURCES, type DiscoveredEvent, type SourceSlug } from "./types";

/* ── Discovery ──────────────────────────────────────────────────────────── */

export type DiscoveryStats = Partial<Record<
  SourceSlug,
  { found: number; added: number; updated: number; alreadyImported: number; error?: string }
>>;

/** Events that already have a real (non per-athlete) import in the database. */
async function findImported(source: SourceSlug, ids: string[]) {
  if (!ids.length) return new Map<string, { eventId: string; results: number }>();
  const rows = await prisma.$queryRaw<{ source_event_id: string; event_id: string; n: bigint }[]>`
    SELECT e.source_event_id, e.id::text AS event_id, count(x.id) AS n
    FROM public.events e
    JOIN public.sources s ON s.id = e.source_id
    JOIN public.races r ON r.event_id = e.id
    JOIN public.results x ON x.race_id = r.id
    WHERE s.slug = ${source}
      AND e.source_event_id = ANY(${ids}::text[])
      AND (x.raw->>'ArrangementUID') IS NULL
    GROUP BY e.source_event_id, e.id`;
  return new Map(rows.map((r) => [r.source_event_id, { eventId: r.event_id, results: Number(r.n) }]));
}

export async function upsertDiscovered(source: SourceSlug, events: DiscoveredEvent[]) {
  const stats = { found: events.length, added: 0, updated: 0, alreadyImported: 0 };
  if (!events.length) return stats;

  const ids = [...new Set(events.map((e) => e.sourceEventId))];
  const existing = new Set(
    (
      await prisma.import_queue.findMany({
        where: { source_slug: source, source_event_id: { in: ids } },
        select: { source_event_id: true },
      })
    ).map((r) => r.source_event_id)
  );
  const fresh = events.filter((e) => !existing.has(e.sourceEventId));
  const stale = events.filter((e) => existing.has(e.sourceEventId));
  const imported = await findImported(
    source,
    fresh.map((e) => e.sourceEventId)
  );
  const checkedAt = new Date().toISOString();

  if (fresh.length) {
    const res = await prisma.import_queue.createMany({
      skipDuplicates: true,
      data: fresh.map((e) => {
        const done = imported.get(e.sourceEventId);
        if (done) stats.alreadyImported++;
        return {
          source_slug: source,
          source_event_id: e.sourceEventId,
          name: e.name,
          event_date: toDateOnly(e.date),
          location: e.location,
          country: e.country,
          sport: e.sport,
          relevance: e.relevance,
          status: done ? "imported" : "pending",
          event_id: done?.eventId ?? null,
          result_count: done?.results ?? null,
          meta: { ...e.meta, hasResults: e.hasResults, checkedAt, preexisting: Boolean(done) } as Prisma.InputJsonValue,
        };
      }),
    });
    stats.added = res.count;
  }

  // Refresh metadata (name/date/"has results" flag) for rows we already know.
  for (let i = 0; i < stale.length; i += 500) {
    const values = stale.slice(i, i + 500).map(
      (e) =>
        Prisma.sql`(${e.sourceEventId}::text, ${e.name}::text, ${e.date}::date, ${e.location}::text, ${JSON.stringify({
          ...e.meta,
          hasResults: e.hasResults,
          checkedAt,
        })}::jsonb)`
    );
    stats.updated += await prisma.$executeRaw`
      UPDATE public.import_queue q
      SET name = COALESCE(v.name, q.name),
          event_date = COALESCE(v.event_date, q.event_date),
          location = COALESCE(q.location, v.location),
          meta = COALESCE(q.meta, '{}'::jsonb) || v.meta,
          updated_at = now()
      FROM (VALUES ${Prisma.join(values)}) AS v(id, name, event_date, location, meta)
      WHERE q.source_slug = ${source} AND q.source_event_id = v.id`;
  }
  return stats;
}

export async function runDiscovery(args: { from: string; to: string; sources?: SourceSlug[] }): Promise<DiscoveryStats> {
  const out = {} as DiscoveryStats;
  for (const source of args.sources ?? CRAWL_SOURCES) {
    try {
      const events = await discover(source, args.from, args.to);
      out[source] = await upsertDiscovered(source, events);
    } catch (e) {
      console.error(`[crawl] discovery ${source} failed:`, e);
      out[source] = { found: 0, added: 0, updated: 0, alreadyImported: 0, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return out;
}

/* ── Queue processing ───────────────────────────────────────────────────── */

export type ProcessStats = {
  processed: number;
  imported: number;
  waiting: number;
  failed: number;
  results: number;
  remaining: number;
  items: { source: string; id: string; name: string | null; status: string; results?: number; error?: string }[];
};

/** Rows the processor may pick up right now. */
function dueWhere(): Prisma.import_queueWhereInput {
  const today = toDateOnly(osloToday())!;
  const now = new Date();
  return {
    AND: [
      { OR: [{ approved: true }, { approved: null, relevance: "running" }] },
      { OR: [{ event_date: null }, { event_date: { lte: today } }] },
      {
        OR: [
          { status: { in: ["pending", "waiting"] }, next_attempt_at: { lte: now } },
          { status: "imported", refresh_at: { lte: now } },
        ],
      },
    ],
  };
}

export async function countDue() {
  return prisma.import_queue.count({ where: dueWhere() });
}

async function releaseStaleLocks() {
  await prisma.import_queue.updateMany({
    where: { status: "importing", locked_at: { lt: new Date(Date.now() - QUEUE.staleLockMinutes * 60_000) } },
    data: { status: "pending", locked_at: null },
  });
}

/**
 * Imports due queue items one at a time until the time budget is spent. Items are
 * claimed atomically, so overlapping runs (cron + button) never import the same
 * event twice.
 */
export async function processQueue(args: { budgetMs: number; maxItems?: number; trigger?: ImportTrigger }): Promise<ProcessStats> {
  const t0 = Date.now();
  const stats: ProcessStats = { processed: 0, imported: 0, waiting: 0, failed: 0, results: 0, remaining: 0, items: [] };
  await releaseStaleLocks();

  const skipped = new Set<string>();
  while (Date.now() - t0 < args.budgetMs && stats.processed < (args.maxItems ?? Infinity)) {
    const next = await prisma.import_queue.findFirst({
      where: { ...dueWhere(), id: { notIn: [...skipped] } },
      orderBy: [{ event_date: { sort: "desc", nulls: "last" } }, { discovered_at: "asc" }],
    });
    if (!next) break;

    // EQ tells us up front whether results exist — don't hammer it before then.
    const meta = (next.meta ?? {}) as { hasResults?: boolean | null; checkedAt?: string };
    const checkedRecently = meta.checkedAt && Date.now() - Date.parse(meta.checkedAt) < 36 * 3_600_000;
    if (next.source_slug === "eqtiming" && meta.hasResults === false && checkedRecently && next.status !== "imported") {
      await prisma.import_queue.update({
        where: { id: next.id },
        data: { status: "waiting", next_attempt_at: new Date(Date.now() + QUEUE.waitingRetryHours * 3_600_000) },
      });
      skipped.add(next.id);
      continue;
    }

    const isRefresh = next.status === "imported";
    const claimed = await prisma.import_queue.updateMany({
      where: { id: next.id, status: next.status },
      data: { status: "importing", locked_at: new Date(), last_attempt_at: new Date() },
    });
    if (claimed.count === 0) {
      skipped.add(next.id);
      continue;
    }

    const outcome = await importEvent({
      source: next.source_slug as SourceSlug,
      sourceEventId: next.source_event_id,
      trigger: args.trigger ?? "queue",
      isRefresh,
    });
    stats.processed++;
    const item: ProcessStats["items"][number] = {
      source: next.source_slug,
      id: next.source_event_id,
      name: next.name,
      status: outcome.status,
    };
    if (outcome.status === "imported") {
      stats.imported++;
      stats.results += outcome.summary.results;
      item.results = outcome.summary.results;
    } else if (outcome.status === "no_results") stats.waiting++;
    else {
      stats.failed++;
      item.error = outcome.error;
    }
    stats.items.push(item);
  }

  stats.remaining = await countDue();
  return stats;
}

/* ── Full crawl (discovery + processing) ────────────────────────────────── */

export type CrawlOptions = {
  trigger: "cron" | "manual" | "backfill" | "cli";
  /** Discovery window; defaults to the last `lookbackDays` days. Pass false to skip discovery. */
  discover?: { from?: string; to?: string; sources?: SourceSlug[] } | false;
  lookbackDays?: number;
  /** Time budget for importing queued events (0 = discovery only). */
  budgetMs?: number;
};

export async function runCrawl(opts: CrawlOptions) {
  const t0 = Date.now();
  const run = await prisma.crawl_runs.create({ data: { trigger: opts.trigger }, select: { id: true } });
  try {
    let discovery: DiscoveryStats | null = null;
    if (opts.discover !== false) {
      const today = osloToday();
      const from = opts.discover?.from ?? isoDate(addDays(toDateOnly(today)!, -(opts.lookbackDays ?? 10)))!;
      const to = opts.discover?.to ?? today;
      discovery = await runDiscovery({ from, to, sources: opts.discover?.sources });
    }

    const remainingBudget = Math.max(0, (opts.budgetMs ?? 0) - (Date.now() - t0));
    const processing =
      remainingBudget > 5_000
        ? await processQueue({ budgetMs: remainingBudget, trigger: opts.trigger === "cron" ? "cron" : "queue" })
        : null;

    const stats = { discovery, processing, durationMs: Date.now() - t0 };
    const errors = Object.entries(discovery ?? {})
      .filter(([, s]) => s.error)
      .map(([k, s]) => `${k}: ${s.error}`);
    await prisma.crawl_runs.update({
      where: { id: run.id },
      data: {
        status: errors.length ? "partial" : "ok",
        finished_at: new Date(),
        stats: stats as unknown as Prisma.InputJsonValue,
        error: errors.join("\n") || null,
      },
    });
    return { runId: run.id, ...stats };
  } catch (e) {
    await prisma.crawl_runs.update({
      where: { id: run.id },
      data: { status: "failed", finished_at: new Date(), error: e instanceof Error ? e.message : String(e) },
    });
    throw e;
  }
}
