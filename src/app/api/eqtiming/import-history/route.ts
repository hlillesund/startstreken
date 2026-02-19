import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { fetchEqParticipantResults } from "@/lib/eqtiming";

function normName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function timeToMs(t: string): number | null {
  if (!t) return null;
  const parts = t.trim().split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;

  let h = 0, m = 0, s = 0;
  if (parts.length === 3) [h, m, s] = parts;
  else if (parts.length === 2) [m, s] = parts;
  else [s] = parts;

  return (h * 3600 + m * 60 + s) * 1000;
}

function shortHash(input: string) {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 16);
}

export async function POST(req: Request) {
  const { uid, name } = await req.json();

  const participantUid = String(uid ?? "").trim();
  const displayName = String(name ?? "").trim();

  if (!participantUid || !displayName) {
    return Response.json({ error: "Need uid + name" }, { status: 400 });
  }

  const source = await prisma.sources.findUnique({ where: { slug: "eqtiming" } });
  if (!source) {
    return Response.json({ error: "Missing sources row for eqtiming" }, { status: 500 });
  }

  // Requires unique index on athletes.display_name_norm
  const athlete = await prisma.athletes.upsert({
    where: { display_name_norm: normName(displayName) },
    update: { display_name: displayName },
    create: { display_name: displayName, display_name_norm: normName(displayName) },
  });

  // ✅ Your schema: @@unique([source_id, source_person_id])
  await prisma.athlete_identities.upsert({
    where: {
      source_id_source_person_id: {
        source_id: source.id,
        source_person_id: participantUid,
      },
    },
    update: { athlete_id: athlete.id },
    create: {
      athlete_id: athlete.id,
      source_id: source.id,
      source_person_id: participantUid,
    },
  });

  const data = await fetchEqParticipantResults(participantUid);
  const items = Array.isArray(data) ? data : (data?.Results ?? data?.results ?? []);
  console.log("EQ history type:", typeof data, "items:", Array.isArray(items) ? items.length : "not array");
console.log("EQ first item keys:", items?.[0] ? Object.keys(items[0]) : "no items");
console.log("EQ first item:", items?.[0] ?? null);

  let inserted = 0;

 for (const item of items) {
  // hopp over entries uten resultat
  if (!item?.HasResult) continue;
  if (item?.WebPubliseres === false) continue;

  const eventName = item?.ArrangementNavn;
  const eventId = item?.ArrangementUID;
  const dateStr = item?.ArrangementDato;

  const raceName = item?.EtappeNavn ?? "Race";
  const raceId = item?.EtappeUID;

  const timeMs = typeof item?.Tid === "number" ? item.Tid : null;
  if (!eventName || !eventId || !timeMs) continue;

  const startDate = dateStr ? new Date(dateStr) : null;

  // 1) upsert event (du har unik på source_id + source_event_id)
  const eventRow = await prisma.events.upsert({
    where: {
      source_id_source_event_id: {
        source_id: source.id,
        source_event_id: String(eventId),
      },
    },
    update: {
      name: String(eventName),
      start_date: startDate,
      updated_at: new Date(),
    },
    create: {
      source_id: source.id,
      source_event_id: String(eventId),
      name: String(eventName),
      start_date: startDate,
      updated_at: new Date(),
    },
  });

  // 2) upsert race (unik på event_id + source_race_id)
  const raceRow = await prisma.races.upsert({
    where: {
      event_id_source_race_id: {
        event_id: eventRow.id,
        source_race_id: String(raceId ?? raceName),
      },
    },
    update: {
      name: String(raceName),
      distance_m: null, // vi kan mappe senere (HM=21097 etc)
    },
    create: {
      event_id: eventRow.id,
      source_race_id: String(raceId ?? raceName),
      name: String(raceName),
      distance_m: null,
    },
  });

  // 3) upsert result (unik på race_id + athlete_id + time_ms)
  await prisma.results.upsert({
    where: {
      race_id_athlete_id_time_ms: {
        race_id: raceRow.id,
        athlete_id: athlete.id,
        time_ms: timeMs,
      },
    },
    update: {
      rank_overall: item?.Plassering ?? null,
      raw: item,
    },
    create: {
      race_id: raceRow.id,
      athlete_id: athlete.id,
      time_ms: timeMs,
      rank_overall: item?.Plassering ?? null,
      bib: null,
      club: null,
      raw: item,
    },
  });

  inserted++;
}

  return Response.json({ ok: true, athleteId: athlete.id, inserted });
}