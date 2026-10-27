// The race index, kept in the database instead of being rebuilt per request.
//
// buildLopIndex() reads every result in the database. Its output (all events,
// races and stats) is far over the 2 MB limit of the Next.js data cache, so it
// used to be rebuilt on every visit to /lop and every race page. Now it is
// stored once per race group, and a page reads only the rows it needs:
//   ss_private.lop_groups  one row per group: list summary + the group with its events
//   ss_private.lop_lookup  event id / slug / alias → group slug
//   ss_private.lop_state   when it was built, whether imports have changed it
// After imports the snapshot is marked dirty and rebuilt in the background at
// most every REBUILD_MIN_MS; admin changes rebuild it right away. The stored
// season bests (lib/season-store.ts) are refreshed in the same rebuild.
import { cache } from "react";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildLopIndex, MAIN_CATS, type LopEvent, type LopGroup, type LopIndex } from "./index";
import { slugFromParam } from "./names";
import { refreshSeasonStore } from "@/lib/season-store";
import { revalidateTag } from "next/cache";

const REBUILD_MIN_MS = 10 * 60_000;
const CLAIM_MS = 5 * 60_000; // a rebuild claimed longer ago than this is assumed dead

export type LopListGroup = {
  slug: string;
  name: string;
  location: string | null;
  first: string | null;
  last: string | null;
  editions: number;
  finishers: number;
  courses: { cat: string; n: number; avg: number | null; avgM: number | null; avgF: number | null }[];
  other: boolean;
};
export type LopLatest = { id: string; name: string; date: string | null; finishers: number };
export type LopList = { groups: LopListGroup[]; latest: LopLatest[]; totals: { editions: number; results: number } };

let tables: Promise<void> | null = null;

function ensureTables() {
  tables ??= (async () => {
    await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS ss_private`);
    await prisma.$executeRawUnsafe(`REVOKE ALL ON SCHEMA ss_private FROM PUBLIC`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ss_private.lop_groups (
        slug    text PRIMARY KEY,
        sort    int NOT NULL,
        summary jsonb NOT NULL,
        data    jsonb NOT NULL
      )`);
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ss_private.lop_lookup (key text PRIMARY KEY, slug text NOT NULL)`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ss_private.lop_state (
        id       int PRIMARY KEY DEFAULT 1,
        built_at timestamptz,
        dirty_at timestamptz,
        force    boolean NOT NULL DEFAULT false,
        building_at timestamptz,
        latest   jsonb NOT NULL DEFAULT '[]',
        totals   jsonb NOT NULL DEFAULT '{}'
      )`);
  })().catch((e) => {
    tables = null;
    throw e;
  });
  return tables;
}

function chunks<T>(xs: T[], n: number) {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

function summarize(g: LopGroup): LopListGroup {
  return {
    slug: g.slug,
    name: g.name,
    location: g.location,
    first: g.first,
    last: g.last,
    editions: g.eventIds.length,
    finishers: g.finishers,
    courses: g.courses
      .filter((c) => (MAIN_CATS as readonly string[]).includes(c.cat))
      .map((c) => ({ cat: c.cat, n: c.n, avg: c.avg, avgM: c.avgM, avgF: c.avgF })),
    other: g.courses.some((c) => c.cat === "OTHER"),
  };
}

/** Builds the index from the database and replaces the stored snapshot. Skips if another rebuild runs. */
export async function rebuildLopSnapshot(): Promise<boolean> {
  await ensureTables();
  // claim the rebuild (a row update works through the connection pooler, unlike session locks)
  const claimed = await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO ss_private.lop_state (id, building_at) VALUES (1, now())
    ON CONFLICT (id) DO UPDATE SET building_at = now()
    WHERE ss_private.lop_state.building_at IS NULL OR ss_private.lop_state.building_at < now() - make_interval(secs => ${CLAIM_MS / 1000})
    RETURNING id`;
  if (claimed.length === 0) return false;
  try {
    const started = new Date();
    const index = await buildLopIndex();

    const latest: LopLatest[] = Object.values(index.events)
      .filter((e) => e.date && e.finishers >= 20)
      .sort((a, b) => b.date!.localeCompare(a.date!))
      .slice(0, 8)
      .map((e) => ({ id: e.id, name: index.groups.find((g) => g.slug === index.groupOf[e.id])?.name ?? e.name, date: e.date, finishers: e.finishers }));
    const totals = { editions: Object.keys(index.events).length, results: index.groups.reduce((t, g) => t + g.finishers, 0) };

    const lookup = new Map<string, string>();
    for (const g of index.groups) lookup.set(g.slug, g.slug);
    for (const [alias, slug] of Object.entries(index.aliases)) if (!lookup.has(alias)) lookup.set(alias, slug);
    for (const [eventId, slug] of Object.entries(index.groupOf)) lookup.set(eventId, slug);

    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`TRUNCATE ss_private.lop_groups, ss_private.lop_lookup`);
        for (const batch of chunks(index.groups.map((g, i) => ({ g, i })), 400)) {
          await tx.$executeRaw`
            INSERT INTO ss_private.lop_groups (slug, sort, summary, data)
            SELECT * FROM unnest(
              ${batch.map(({ g }) => g.slug)}::text[],
              ${batch.map(({ i }) => i)}::int[],
              ${batch.map(({ g }) => JSON.stringify(summarize(g)))}::jsonb[],
              ${batch.map(({ g }) => JSON.stringify({ group: g, events: Object.fromEntries(g.eventIds.map((id) => [id, index.events[id]])) }))}::jsonb[]
            )`;
        }
        for (const batch of chunks([...lookup.entries()], 5000)) {
          await tx.$executeRaw`
            INSERT INTO ss_private.lop_lookup (key, slug)
            SELECT * FROM unnest(${batch.map(([k]) => k)}::text[], ${batch.map(([, s]) => s)}::text[])`;
        }
        // a change marked while we were building keeps the snapshot dirty
        await tx.$executeRaw`
          INSERT INTO ss_private.lop_state (id, built_at, dirty_at, force, latest, totals)
          VALUES (1, ${started}, NULL, false, ${JSON.stringify(latest)}::jsonb, ${JSON.stringify(totals)}::jsonb)
          ON CONFLICT (id) DO UPDATE SET
            built_at = EXCLUDED.built_at,
            latest = EXCLUDED.latest,
            totals = EXCLUDED.totals,
            dirty_at = CASE WHEN ss_private.lop_state.dirty_at > ${started} THEN ss_private.lop_state.dirty_at END,
            force = CASE WHEN ss_private.lop_state.dirty_at > ${started} THEN ss_private.lop_state.force ELSE false END`;
      },
      { timeout: 120_000, maxWait: 15_000 }
    );
    // season bests (ranks, «Hvor havner jeg?») come from the same results
    await refreshSeasonStore();
    try {
      revalidateTag("season", "max");
    } catch {
      // outside a request: the top lists refresh within their lifetime anyway
    }
    return true;
  } finally {
    await prisma.$executeRaw`UPDATE ss_private.lop_state SET building_at = NULL WHERE id = 1`;
  }
}

/** Imports changed results: rebuild soon (at most every few minutes). Admin edits: rebuild on the next request. */
export async function markLopDirty(force = false) {
  try {
    await ensureTables();
    await prisma.$executeRaw`
      INSERT INTO ss_private.lop_state (id, dirty_at, force) VALUES (1, now(), ${force})
      ON CONFLICT (id) DO UPDATE SET dirty_at = now(), force = ss_private.lop_state.force OR ${force}`;
  } catch (e) {
    console.error("[lop] mark dirty failed", e);
  }
}

/** Builds the first snapshot inline; afterwards refreshes in the background when it is stale. */
export const ensureFresh = cache(async () => {
  await ensureTables();
  const [state] = await prisma.$queryRaw<{ built_at: Date | null; dirty_at: Date | null; force: boolean }[]>`
    SELECT built_at, dirty_at, force FROM ss_private.lop_state WHERE id = 1`;
  if (!state?.built_at) {
    await rebuildLopSnapshot();
    return;
  }
  const due = state.dirty_at && (state.force || Date.now() - state.built_at.getTime() > REBUILD_MIN_MS);
  if (due) {
    after(async () => {
      try {
        await rebuildLopSnapshot();
      } catch (e) {
        console.error("[lop] rebuild failed", e);
      }
    });
  }
});

/** Everything /lop lists. */
export const getLopList = cache(async (): Promise<LopList> => {
  await ensureFresh();
  const [rows, [state]] = await Promise.all([
    prisma.$queryRaw<{ summary: LopListGroup }[]>`SELECT summary FROM ss_private.lop_groups ORDER BY sort`,
    prisma.$queryRaw<{ latest: LopLatest[]; totals: LopList["totals"] }[]>`SELECT latest, totals FROM ss_private.lop_state WHERE id = 1`,
  ]);
  return { groups: rows.map((r) => r.summary), latest: state?.latest ?? [], totals: state?.totals ?? { editions: 0, results: 0 } };
});

/**
 * The group a race page is about, as a small LopIndex holding just that group
 * and its events (what EditionView and GroupView need). `param` is an event id,
 * a group slug or an alias.
 */
export const getLopFor = cache(async (param: string): Promise<LopIndex | null> => {
  await ensureFresh();
  const keys = [...new Set([param, param.toLowerCase(), slugFromParam(param)].filter(Boolean))];
  const rows = await prisma.$queryRaw<{ key: string; data: { group: LopGroup; events: Record<string, LopEvent> } }[]>`
    SELECT l.key, g.data
    FROM ss_private.lop_lookup l JOIN ss_private.lop_groups g ON g.slug = l.slug
    WHERE l.key = ANY(${keys})`;
  // same preference as findGroup: the exact key before the normalised one
  const row = keys.map((k) => rows.find((r) => r.key === k)).find(Boolean);
  if (!row) return null;
  const { group, events } = row.data;
  return { groups: [group], events, groupOf: Object.fromEntries(group.eventIds.map((id) => [id, group.slug])), aliases: {} };
});
