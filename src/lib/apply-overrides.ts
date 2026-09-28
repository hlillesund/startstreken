// src/lib/import/apply-overrides.ts
import { prisma } from "@/lib/prisma";

type DistanceCategory = "5K" | "10K" | "HM" | "M" | "OTHER";

export type ImportOverride = {
  event_name?: string | null;
  start_date?: string | null; // "YYYY-MM-DD"
  location?: string | null;
  race_name?: string | null;
  distance_m?: number | null;
  distance_category?: DistanceCategory | null;
};

function toDateOnly(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

export async function applyOverrides(args: {
  sourceSlug: string;
  sourceEventId: string;
  sourceRaceId?: string | null;
  override: ImportOverride;
}) {
  const o = args.override ?? {};

  const hasEventOverride = o.event_name != null || o.start_date != null || o.location != null;
  const hasRaceOverride =
    o.race_name != null || o.distance_m !== undefined || o.distance_category != null;

  if (!hasEventOverride && !hasRaceOverride) {
    return { applied: false, eventUpdated: false, raceUpdated: false, resultsUpdated: 0 };
  }

  const source = await prisma.sources.findUnique({ where: { slug: args.sourceSlug } });
  if (!source) throw new Error(`Missing source: ${args.sourceSlug}`);

  const eventRow = await prisma.events.findUnique({
    where: {
      source_id_source_event_id: {
        source_id: source.id,
        source_event_id: String(args.sourceEventId),
      },
    },
    select: { id: true },
  });

  if (!eventRow) {
    return {
      applied: false,
      eventUpdated: false,
      raceUpdated: false,
      resultsUpdated: 0,
      note: "Event not found yet",
    };
  }

  let eventUpdated = false;

  if (hasEventOverride) {
    await prisma.events.update({
      where: { id: eventRow.id },
      data: {
        ...(o.event_name != null && { name: o.event_name }),
        ...(o.start_date !== undefined && { start_date: toDateOnly(o.start_date) }),
        ...(o.location !== undefined && { location: o.location }),
        updated_at: new Date(),
      },
    });
    eventUpdated = true;
  }

  let raceUpdated = false;
  let resultsUpdated = 0;

  if (hasRaceOverride && args.sourceRaceId != null && args.sourceRaceId !== "") {
    const raceRow = await prisma.races.findUnique({
      where: {
        event_id_source_race_id: {
          event_id: eventRow.id,
          source_race_id: String(args.sourceRaceId),
        },
      },
      select: { id: true },
    });

    if (raceRow) {
      await prisma.races.update({
        where: { id: raceRow.id },
        data: {
          ...(o.race_name != null && { name: o.race_name }),
          ...(o.distance_m !== undefined && { distance_m: o.distance_m }),
        },
      });
      raceUpdated = true;

      if (o.distance_category != null) {
        const res = await prisma.results.updateMany({
          where: { race_id: raceRow.id },
          data: { distance_category: o.distance_category },
        });
        resultsUpdated = res.count ?? 0;
      }
    }
  }

  return { applied: true, eventUpdated, raceUpdated, resultsUpdated };
}