import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { countDue } from "@/lib/import/crawler";
import { importEvent } from "@/lib/import/run";
import { sourceEventUrl } from "@/lib/import/sources";
import { isSourceSlug, type SourceSlug } from "@/lib/import/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PAGE_SIZE = 50;

const AUTO = { OR: [{ approved: true }, { approved: null, relevance: "running" }] } satisfies Prisma.import_queueWhereInput;

const TABS = {
  todo: { AND: [AUTO, { status: { in: ["pending", "waiting", "importing"] } }] },
  review: { approved: null, relevance: "maybe", status: { in: ["pending", "waiting"] } },
  imported: { status: "imported" },
  failed: { status: { in: ["failed", "no_results"] } },
  ignored: { OR: [{ status: "ignored" }, { approved: false }] },
  all: {},
} satisfies Record<string, Prisma.import_queueWhereInput>;

type Tab = keyof typeof TABS;

/** GET /api/admin/queue?tab=todo&source=&q=&page=1 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const tab = (sp.get("tab") ?? "todo") as Tab;
  const source = sp.get("source");
  const q = sp.get("q")?.trim();
  const page = Math.max(1, Number(sp.get("page")) || 1);

  const filters: Prisma.import_queueWhereInput[] = [];
  if (source && isSourceSlug(source)) filters.push({ source_slug: source });
  if (q) {
    filters.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { source_event_id: { contains: q } },
        { location: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  const where = { AND: [TABS[tab] ?? TABS.todo, ...filters] };

  const [items, total, counts, lastCrawl, due] = await Promise.all([
    prisma.import_queue.findMany({
      where,
      orderBy: [{ event_date: { sort: "desc", nulls: "last" } }, { discovered_at: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.import_queue.count({ where }),
    Promise.all(
      (Object.keys(TABS) as Tab[]).map(async (t) => [t, await prisma.import_queue.count({ where: { AND: [TABS[t], ...filters] } })] as const)
    ),
    prisma.crawl_runs.findFirst({ orderBy: { started_at: "desc" } }),
    countDue(),
  ]);

  return NextResponse.json({
    items: items.map((i) => ({
      ...i,
      event_date: i.event_date?.toISOString().slice(0, 10) ?? null,
      url: isSourceSlug(i.source_slug) ? sourceEventUrl(i.source_slug, i.source_event_id) : null,
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    counts: Object.fromEntries(counts),
    lastCrawl,
    due,
  });
}

type Action = "approve" | "ignore" | "retry" | "import" | "setDate";

/** POST /api/admin/queue { action, ids, date? } */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { action?: Action; ids?: string[]; date?: string };
  const ids = (body.ids ?? []).filter((x) => typeof x === "string").slice(0, 500);
  if (!ids.length) return NextResponse.json({ ok: false, error: "Ingen rader valgt" }, { status: 400 });
  const now = new Date();

  switch (body.action) {
    case "approve": {
      await prisma.import_queue.updateMany({ where: { id: { in: ids } }, data: { approved: true, updated_at: now } });
      const res = await prisma.import_queue.updateMany({
        where: { id: { in: ids }, status: { in: ["ignored", "no_results", "failed"] } },
        data: { status: "pending", next_attempt_at: now, attempts: 0 },
      });
      return NextResponse.json({ ok: true, updated: ids.length, requeued: res.count });
    }
    case "ignore": {
      const res = await prisma.import_queue.updateMany({
        where: { id: { in: ids }, status: { not: "importing" } },
        data: { approved: false, status: "ignored", refresh_at: null, updated_at: now },
      });
      return NextResponse.json({ ok: true, updated: res.count });
    }
    case "retry": {
      const res = await prisma.import_queue.updateMany({
        where: { id: { in: ids }, status: { in: ["waiting", "failed", "no_results", "pending"] } },
        data: { status: "pending", attempts: 0, next_attempt_at: now, last_error: null, updated_at: now },
      });
      return NextResponse.json({ ok: true, updated: res.count });
    }
    case "setDate": {
      // Confirms/corrects an (estimated) event date — used for scanned Ultimate events.
      if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
        return NextResponse.json({ ok: false, error: "Ugyldig dato" }, { status: 400 });
      }
      const eventDate = new Date(`${body.date}T00:00:00Z`);
      const rows = await prisma.import_queue.findMany({
        where: { id: { in: ids } },
        select: { id: true, meta: true, event_id: true },
      });
      for (const row of rows) {
        const meta = { ...((row.meta as Record<string, unknown> | null) ?? {}), dateEstimated: false };
        await prisma.import_queue.update({ where: { id: row.id }, data: { event_date: eventDate, meta, updated_at: now } });
        if (row.event_id) {
          await prisma.events.update({ where: { id: row.event_id }, data: { start_date: eventDate, updated_at: now } });
        }
      }
      return NextResponse.json({ ok: true, updated: rows.length });
    }
    case "import": {
      // Runs synchronously; the UI sends a handful at a time.
      const rows = await prisma.import_queue.findMany({ where: { id: { in: ids.slice(0, 5) } } });
      const results = [];
      for (const row of rows) {
        if (!isSourceSlug(row.source_slug)) continue;
        await prisma.import_queue.update({ where: { id: row.id }, data: { approved: true } });
        const outcome = await importEvent({
          source: row.source_slug as SourceSlug,
          sourceEventId: row.source_event_id,
          trigger: "manual",
        });
        results.push({ id: row.id, name: row.name, ...outcome });
      }
      return NextResponse.json({ ok: true, results });
    }
    default:
      return NextResponse.json({ ok: false, error: "Ukjent handling" }, { status: 400 });
  }
}
