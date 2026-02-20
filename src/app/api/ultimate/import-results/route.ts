import { prisma } from "@/lib/prisma";
import {
  fetchUltimateResultsAllRaw,
  fetchUltimateNorSearchAllRaw,
} from "@/lib/ultimate";
import { parseUltimateResultsFromPages } from "@/lib/ultimate-parse";
import { resolveAthleteForIdentity } from "@/lib/athlete-merge";
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
  // - default: mode=results paging (som før)
  // - onlyNor: mode=search advanced + search_nation=NOR paging
  const pages = onlyNor
    ? await fetchUltimateNorSearchAllRaw(eventId, distance)
    : await fetchUltimateResultsAllRaw(eventId, distance);

  const rows = parseUltimateResultsFromPages(pages);

  console.log(
    `[ultimate] mode=${onlyNor ? "search:NOR" : "results:ALL"} event=${eventId} distance=${distance} pages=${pages.length} parsedRows=${rows.length}`
  );
  console.log(`[ultimate] firstRow=`, rows[0] ?? null);

  // 2) Event + race (deterministisk)
  const sourceEventId = String(eventId);
  const eventRow = await prisma.events.upsert({
    where: {
      source_id_source_event_id: {
        source_id: source.id,
        source_event_id: sourceEventId,
      },
    },
    update: { updated_at: new Date() },
    create: {
      source_id: source.id,
      source_event_id: sourceEventId,
      name: `Ultimate event ${eventId}`,
      start_date: null,
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
    update: { name: `Distance ${distance}` },
    create: {
      event_id: eventRow.id,
      source_race_id: sourceRaceId,
      name: `Distance ${distance}`,
      distance_m: null,
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

      // syntetisk identity-key (stabil nok for merge, men ikke perfekt)
      const sourcePersonId = `synt:${shortHash(
        `${r.name}|${r.club ?? ""}|${r.category ?? ""}`
      )}`;

      const resolved = await resolveAthleteForIdentity({
        sourceSlug: "ultimate",
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
        },
        create: {
          race_id: raceRow.id,
          athlete_id: resolved.athleteId,
          time_ms: timeMs,
          rank_overall: r.rank,
          bib: r.bib,
          club: r.club,
          raw: r as any,
        },
      });

      imported++;
    } catch (e) {
      failed++;
      if (failed <= 5) {
        console.error("[ultimate] row failed:", r, e);
      }
    }

    if (i > 0 && i % 500 === 0) {
      console.log(
        `[ultimate] progress ${i}/${rows.length} imported=${imported} skipped=${skipped} failed=${failed}`
      );
    }
  }

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
    failed,
  });
}