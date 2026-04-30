// src/app/api/ultimate/import/route.ts
import { importUltimateBatch } from "@/lib/ultimate-batch-import";
import { applyOverrides } from "@/lib/apply-overrides";
import { prisma } from "@/lib/prisma";
import {
  fetchUltimateResultsAllRaw,
  fetchUltimateNorSearchAllRaw,
} from "@/lib/ultimate";
import { parseUltimateResultsFromPages } from "@/lib/ultimate-parse";
import { resolveAthleteForIdentity } from "@/lib/athlete-merge";
import { getImportPreset } from "@/lib/import_presets";
import crypto from "crypto";

function shortHash(s: string) {
  return crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);
}

function timeToMs(time: string): number | null {
  if (!time) return null;
  const t = time.trim();
  const parts = t.split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;

  let h = 0,
    m = 0,
    s = 0;

  if (parts.length === 3) [h, m, s] = parts;
  else if (parts.length === 2) [m, s] = parts;
  else return null;

  return (h * 3600 + m * 60 + s) * 1000;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const eventId = Number(body.eventId);
  const distance = Number(body.distance);

  // default = samme som før
  const onlyNor = Boolean(body.onlyNor);

  if (!Number.isFinite(eventId) || !Number.isFinite(distance)) {
    return Response.json(
      { error: "Need eventId + distance (numbers)" },
      { status: 400 }
    );
  }

  const source = await prisma.sources.findUnique({
    where: { slug: "ultimate" },
  });
  if (!source) {
    return Response.json(
      { error: "Missing sources row for ultimate" },
      { status: 500 }
    );
  }

  // 1) Hent alle pages
  // - default: mode=results paging
  // - onlyNor: mode=search advanced + search_nation=NOR paging
  const pages = onlyNor
    ? await fetchUltimateNorSearchAllRaw(eventId, distance)
    : await fetchUltimateResultsAllRaw(eventId, distance);

  const rows = parseUltimateResultsFromPages(pages);

  console.log(
    `[ultimate] mode=${onlyNor ? "search:NOR" : "results:ALL"} event=${eventId} distance=${distance} pages=${pages.length} parsedRows=${rows.length}`
  );
  console.log(`[ultimate] firstRow=`, rows[0] ?? null);

  // 2) Hent preset (hvis finnes) for å override metadata
  const preset = await getImportPreset({
    sourceSlug: "ultimate",
    sourceEventId: String(eventId),
    sourceRaceId: String(distance),
  });

  const eventName = preset?.event_name ?? `Ultimate event ${eventId}`;
  const raceName = preset?.race_name ?? `Distance ${distance}`;
  const startDate = preset?.start_date ?? null;
  const location = preset?.location ?? null;
  const distanceM = preset?.distance_m ?? null;
  const distanceCategory = preset?.distance_category ?? null;

  // 3) Event + race (deterministisk IDs fra source_event_id + source_race_id)
  const sourceEventId = String(eventId);
  const eventRow = await prisma.events.upsert({
    where: {
      source_id_source_event_id: {
        source_id: source.id,
        source_event_id: sourceEventId,
      },
    },
    update: {
      name: eventName,
      start_date: startDate,
      location: location ?? undefined,
      updated_at: new Date(),
    },
    create: {
      source_id: source.id,
      source_event_id: sourceEventId,
      name: eventName,
      start_date: startDate,
      location,
      updated_at: new Date(),
    },
  });

  const sourceRaceId = String(distance);
  const raceRow = await prisma.races.upsert({
    where: {
      event_id_source_race_id: {
        event_id: eventRow.id,
        source_race_id: sourceRaceId,
      },
    },
    update: {
      name: raceName,
      distance_m: distanceM ?? undefined,
    },
    create: {
      event_id: eventRow.id,
      source_race_id: sourceRaceId,
      name: raceName,
      distance_m: distanceM,
    },
  });

const { imported, linked, skipped } = await importUltimateBatch({
  rows,
  raceId: raceRow.id,
  distanceCategory: distanceCategory ?? null,
  sourceId: source.id,
});

const override = body.override ?? {};

await applyOverrides({
  sourceSlug: "ultimate",
  sourceEventId: String(eventId),
  sourceRaceId: String(distance),
  override,
});
  return Response.json({
    ok: true,
    mode: onlyNor ? "search:NOR" : "results:ALL",
    eventId,
    distance,
    pages: pages.length,
    parsed: rows.length,
    imported,
    linked,
    skipped,
    presetUsed: Boolean(preset),
    preset: preset
      ? {
          event_name: preset.event_name,
          start_date: preset.start_date,
          location: preset.location,
          race_name: preset.race_name,
          distance_m: preset.distance_m,
          distance_category: preset.distance_category,
        }
      : null,
  });
}