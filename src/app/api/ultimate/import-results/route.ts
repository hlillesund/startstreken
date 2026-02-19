import { prisma } from "@/lib/prisma";
import { fetchUltimateResultsRaw } from "@/lib/ultimate";
import { parseUltimateResults } from "@/lib/ultimate-parse";
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

  let h = 0, m = 0, s = 0;
  if (parts.length === 3) [h, m, s] = parts;
  else if (parts.length === 2) [m, s] = parts;
  else return null;

  return (h * 3600 + m * 60 + s) * 1000;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const eventId = Number(body.eventId);
  const distance = Number(body.distance);

  if (!Number.isFinite(eventId) || !Number.isFinite(distance)) {
    return Response.json({ error: "Need eventId + distance (numbers)" }, { status: 400 });
  }

  const source = await prisma.sources.findUnique({ where: { slug: "ultimate" } });
  if (!source) return Response.json({ error: "Missing sources row for ultimate" }, { status: 500 });

  const raw = await fetchUltimateResultsRaw(eventId, distance);

  // Parse rows
  const rows = parseUltimateResults(raw);

  console.log(`[ultimate] event=${eventId} distance=${distance} parsedRows=${rows.length}`);
  console.log(`[ultimate] firstRow=`, rows[0] ?? null);

  // Event + race (deterministisk)
  const sourceEventId = String(eventId);
  const eventRow = await prisma.events.upsert({
    where: { source_id_source_event_id: { source_id: source.id, source_event_id: sourceEventId } },
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
    where: { event_id_source_race_id: { event_id: eventRow.id, source_race_id: sourceRaceId } },
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

  for (const r of rows) {
    if (!r.name || !r.timeStr) continue;

    const timeMs = timeToMs(r.timeStr);
    if (!timeMs) continue;

    // Ultimate har ikke alltid global runner-id i denne tabellen.
    // Vi lager syntetisk identity-key (stabil nok for merge, men ikke perfekt).
    const sourcePersonId = `synt:${shortHash(`${r.name}|${r.club ?? ""}|${r.category ?? ""}`)}`;

    const resolved = await resolveAthleteForIdentity({
      sourceSlug: "ultimate",
      sourcePersonId,
      displayName: r.name,
      gender: null,      // kan utledes fra category senere hvis du vil
      birthYear: null,   // kan utledes hvis category inneholder år
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
  }

  return Response.json({ ok: true, eventId, distance, parsed: rows.length, imported, linked });
}