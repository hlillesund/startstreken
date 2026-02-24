// src/app/api/raceresult/import-results/route.ts
import { prisma } from "@/lib/prisma";
import { fetchRaceResultListAllRaw } from "@/lib/raceresult";
import { parseRaceResultListFromPages } from "@/lib/raceresult-parse";
import { resolveAthleteForIdentity } from "@/lib/athlete-merge";
import { getImportPreset } from "@/lib/import_presets";
import crypto from "crypto";

function shortHash(s: string) {
  return crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);
}

function timeToMs(time: string): number | null {
  if (!time) return null;
  const t = time.trim();
  if (!t) return null;

  const parts = t.split(":").map((x) => Number(x));
  if (parts.some((n) => Number.isNaN(n))) return null;

  let h = 0, m = 0, s = 0;
  if (parts.length === 3) [h, m, s] = parts;
  else if (parts.length === 2) [m, s] = parts;
  else return null;

  return (h * 3600 + m * 60 + s) * 1000;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const eventId = Number(body.eventId);
  const key = String(body.key ?? "");
  const listName = String(body.listName ?? "Online|Final");
  const contest = Number(body.contest ?? 0);
  const filter = String(body.filter ?? "");

  if (!Number.isFinite(eventId) || !key) {
    return Response.json(
      { error: "Need eventId (number) + key (string)" },
      { status: 400 }
    );
  }

  const source = await prisma.sources.findUnique({
    where: { slug: "raceresult" },
  });
  if (!source) {
    return Response.json(
      { error: "Missing sources row for raceresult" },
      { status: 500 }
    );
  }

  // --- HENT PRESET ---
  const sourceRaceId = `${listName}|${contest}|${filter || "ALL"}`;

  const preset = await getImportPreset({
    sourceSlug: "raceresult",
    sourceEventId: String(eventId),
    sourceRaceId,
  });

  // --- FETCH RAW ---
  const pages = await fetchRaceResultListAllRaw(
    eventId,
    key,
    listName,
    contest,
    filter
  );

  const rows = parseRaceResultListFromPages(pages);

  console.log(
    `[raceresult] event=${eventId} rows=${rows.length} presetUsed=${Boolean(
      preset
    )}`
  );

  // --- METADATA FRA PRESET ---
  const eventName = preset?.event_name ?? `RaceResult event ${eventId}`;
  const raceName =
    preset?.race_name ?? `RaceResult ${listName} ${filter || "ALL"}`;

  const startDate = preset?.start_date ?? null;
  const location = preset?.location ?? null;
  const distanceM = preset?.distance_m ?? null;
  const distanceCategory = preset?.distance_category ?? null;

  // --- UPSERT EVENT ---
  const eventRow = await prisma.events.upsert({
    where: {
      source_id_source_event_id: {
        source_id: source.id,
        source_event_id: String(eventId),
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
      source_event_id: String(eventId),
      name: eventName,
      start_date: startDate,
      location,
      updated_at: new Date(),
    },
  });

  // --- UPSERT RACE ---
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

  let imported = 0;
  let linked = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];

    try {
      if (!r.name || !r.timeStr) {
        skipped++;
        continue;
      }

      const timeMs = timeToMs(r.timeStr);
      if (!timeMs) {
        skipped++;
        continue;
      }

      const sourcePersonId = `synt:${shortHash(
        `${r.name}|${r.club ?? ""}|${r.category ?? ""}`
      )}`;

      const resolved = await resolveAthleteForIdentity({
        sourceSlug: "raceresult",
        sourcePersonId,
        displayName: r.name,
        gender: null,
        birthYear: null,
        club: r.club,
        payload: r,
      });

      if (resolved.linked) linked++;

      await prisma.results.upsert({
        where: {
          race_id_athlete_id_time_ms: {
            race_id: raceRow.id,
            athlete_id: resolved.athleteId,
            time_ms: timeMs,
          },
        },
        update: {
          rank_overall: r.rank,
          bib: r.bib,
          club: r.club,
          raw: r as any,
          distance_category: distanceCategory ?? undefined,
        },
        create: {
          race_id: raceRow.id,
          athlete_id: resolved.athleteId,
          time_ms: timeMs,
          rank_overall: r.rank,
          bib: r.bib,
          club: r.club,
          raw: r as any,
          distance_category: distanceCategory,
        },
      });

      imported++;
    } catch (e) {
      failed++;
      if (failed <= 5) console.error("[raceresult] row failed:", r, e);
    }
  }

  return Response.json({
    ok: true,
    eventId,
    listName,
    contest,
    filter: filter || null,
    pages: pages.length,
    parsed: rows.length,
    imported,
    linked,
    skipped,
    failed,
    presetUsed: Boolean(preset),
  });
}