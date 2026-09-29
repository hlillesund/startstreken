import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLopIndex, invalidateLop, type LopGroup } from "@/lib/lop/index";
import { nameKey, slugify } from "@/lib/lop/names";
import { suggestMerges } from "@/lib/lop/suggest";

export const dynamic = "force-dynamic";

/*
 * Grouping of events into "løp" (see src/lib/lop/index.ts). Groups formed by
 * name need no series; a series is created as soon as the admin changes a
 * group by hand, and becomes the group's identity from then on.
 */

async function redundantSeries() {
  const [trivial, empty] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>`
      SELECT s.id::text FROM public.event_series s
      JOIN public.events e ON e.series_id = s.id
      GROUP BY s.id
      HAVING count(*) = 1 AND lower(trim(max(e.name))) = lower(trim(s.name))`,
    prisma.$queryRaw<{ id: string }[]>`
      SELECT s.id::text FROM public.event_series s
      WHERE NOT EXISTS (SELECT 1 FROM public.events e WHERE e.series_id = s.id)`,
  ]);
  return { trivial: trivial.map((r) => r.id), empty: empty.map((r) => r.id) };
}

export async function GET() {
  const index = await getLopIndex();
  const redundant = await redundantSeries();
  return NextResponse.json({
    ok: true,
    groups: index.groups.map((g) => ({
      slug: g.slug,
      name: g.name,
      location: g.location,
      seriesId: g.seriesId,
      first: g.first,
      last: g.last,
      finishers: g.finishers,
      cats: [...new Set(g.courses.map((c) => c.cat))],
      editions: g.eventIds.map((id) => {
        const e = index.events[id];
        return { id, name: e.name, date: e.date, location: e.location, finishers: e.finishers };
      }),
    })),
    suggestions: suggestMerges(index),
    redundant: { trivial: redundant.trivial.length, empty: redundant.empty.length },
  });
}

async function createSeries(name: string) {
  const base = nameKey(name) || slugify(name) || "lop";
  let slug = base;
  for (let i = 2; await prisma.event_series.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${base}-${i}`;
  return prisma.event_series.create({ data: { name, slug }, select: { id: true } });
}

/** Link events to a series, then drop series that were emptied by it. */
async function link(eventIds: string[], seriesId: string) {
  const before = await prisma.events.findMany({ where: { id: { in: eventIds } }, select: { series_id: true } });
  await prisma.events.updateMany({ where: { id: { in: eventIds } }, data: { series_id: seriesId } });
  const old = [...new Set(before.map((e) => e.series_id).filter((s): s is string => !!s && s !== seriesId))];
  if (old.length) await prisma.event_series.deleteMany({ where: { id: { in: old }, events: { none: {} } } });
}

/** A group's series, created from the group's name when it has none yet. */
async function seriesFor(g: LopGroup, name?: string) {
  if (g.seriesId) return g.seriesId;
  const s = await createSeries(name || g.name);
  await link(g.eventIds, s.id);
  return s.id;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const index = await getLopIndex();
  const bySlug = new Map(index.groups.map((g) => [g.slug, g]));
  const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  try {
    switch (body.action) {
      /* Several groups → one. The first group's series (or name) wins. */
      case "merge": {
        const groups = (Array.isArray(body.slugs) ? body.slugs : []).map((s: string) => bySlug.get(s)).filter(Boolean) as LopGroup[];
        if (groups.length < 2) return fail("Velg minst to løp");
        const name = str(body.name);
        const target = groups.find((g) => g.seriesId)?.seriesId ?? (await createSeries(name || groups[0].name)).id;
        const seriesIds = groups.map((g) => g.seriesId).filter((s): s is string => !!s);
        // Also move series members that aren't (fully) imported yet.
        const extra = seriesIds.length
          ? (await prisma.events.findMany({ where: { series_id: { in: seriesIds } }, select: { id: true } })).map((e) => e.id)
          : [];
        await link([...new Set([...groups.flatMap((g) => g.eventIds), ...extra])], target);
        if (name) await prisma.event_series.update({ where: { id: target }, data: { name, updated_at: new Date() } });
        break;
      }

      case "rename": {
        const g = bySlug.get(str(body.slug));
        const name = str(body.name);
        if (!g || !name) return fail("Mangler løp eller navn");
        const id = await seriesFor(g, name);
        await prisma.event_series.update({ where: { id }, data: { name, updated_at: new Date() } });
        break;
      }

      /* Put events (by id — also ones not yet imported) into a group. */
      case "add": {
        const g = bySlug.get(str(body.slug));
        const ids = (Array.isArray(body.eventIds) ? body.eventIds : []).filter((x: unknown) => typeof x === "string");
        if (!g || !ids.length) return fail("Mangler løp eller utgaver");
        await link(ids, await seriesFor(g));
        break;
      }

      /* Take one edition out of its group into a new group of its own. */
      case "split": {
        const eventId = str(body.eventId);
        const name = str(body.name);
        const ev = index.events[eventId];
        if (!ev || !name) return fail("Mangler utgave eller navn");
        if (name.toLowerCase() === ev.name.trim().toLowerCase()) return fail("Gi det nye løpet et navn uten årstall, f.eks. «Sentrumsløpet Bryne»");
        const s = await createSeries(name);
        await link([eventId], s.id);
        break;
      }

      /* Remove the series: its editions go back to grouping by name. */
      case "dissolve": {
        const g = bySlug.get(str(body.slug));
        if (!g?.seriesId) return fail("Løpet har ingen manuell gruppering");
        await prisma.events.updateMany({ where: { series_id: g.seriesId }, data: { series_id: null } });
        await prisma.event_series.delete({ where: { id: g.seriesId } });
        break;
      }

      /* Series left by older imports: one per event with the event's own name, or empty. */
      case "cleanup": {
        const { trivial, empty } = await redundantSeries();
        const ids = [...trivial, ...empty];
        if (ids.length) {
          await prisma.events.updateMany({ where: { series_id: { in: ids } }, data: { series_id: null } });
          await prisma.event_series.deleteMany({ where: { id: { in: ids } } });
        }
        invalidateLop();
        return NextResponse.json({ ok: true, removed: ids.length });
      }

      default:
        return fail("Ukjent handling");
    }
  } catch (e) {
    console.error("[admin/lop]", e);
    return fail(e instanceof Error ? e.message : "Noe gikk galt", 500);
  }

  invalidateLop();
  return NextResponse.json({ ok: true });
}
