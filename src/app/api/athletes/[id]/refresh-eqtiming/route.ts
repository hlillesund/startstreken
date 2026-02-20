import { prisma } from "@/lib/prisma";
import { fetchEqParticipantResults } from "@/lib/eqtiming";

type Ctx = { params: Promise<{ id: string }> };

type DistanceCategory = "5K" | "10K" | "HM" | "M" | "OTHER";

/* ---------- DISTANCE CLASSIFIER ---------- */

const OTHER_WORDS = [
  "trippel",
  "trippelen",
  "stafett",
  "relay",
  "ultra",
  "barn",
  "kids",
  "trim",
];

const RE_HELMARATON = /\bhelmaraton\b/i;
const RE_MARATON = /\bmaraton|marathon\b/i;
const RE_HALV = /\bhalvmaraton|half marathon|halfmarathon|hm\b/i;

const RE_5000 = /\b(5000|5\s?000)\s?(m|meter)\b/i;
const RE_10000 = /\b(10000|10\s?000)\s?(m|meter)\b/i;

const RE_5KM = /\b5\s?(km|k)\b|\b5k\b/i;
const RE_10KM = /\b10\s?(km|k)\b|\b10k\b/i;

const RE_MIL = /\bmil(a|en)?\b/i;

function classifyLabel(label: string): DistanceCategory | null {
  if (!label) return null;

  const t = label.toLowerCase();

  if (OTHER_WORDS.some((w) => t.includes(w))) return "OTHER";

  if (RE_HELMARATON.test(t)) return "M";
  if (RE_MARATON.test(t)) return "M";
  if (RE_HALV.test(t)) return "HM";

  if (RE_5000.test(t)) return "5K";
  if (RE_10000.test(t)) return "10K";

  if (RE_5KM.test(t)) return "5K";
  if (RE_10KM.test(t)) return "10K";

  if (RE_MIL.test(t)) return "10K";

  return null;
}

function classifyDistance(raceName?: string, eventName?: string): DistanceCategory {
  const primary = classifyLabel(raceName ?? "");
  if (primary) return primary;

  const secondary = classifyLabel(eventName ?? "");
  if (secondary) return secondary;

  return "OTHER";
}

/* ---------- ROUTE ---------- */

export async function POST(_: Request, context: Ctx) {
  const { id: athleteId } = await context.params;

  const source = await prisma.sources.findUnique({ where: { slug: "eqtiming" } });
  if (!source) return Response.json({ error: "Missing source eqtiming" }, { status: 500 });

  const identity = await prisma.athlete_identities.findFirst({
    where: { athlete_id: athleteId, source_id: source.id },
  });

  if (!identity) {
    return Response.json(
      { error: "NO_EQTIMING_UID", message: "Utøveren er ikke koblet til EQTiming UID ennå." },
      { status: 400 }
    );
  }

  const uid = identity.source_person_id;

  const data = await fetchEqParticipantResults(uid);
  const items = Array.isArray(data) ? data : (data?.Results ?? data?.results ?? []);

  let inserted = 0;

  for (const item of items) {
    if (!item?.HasResult) continue;
    if (item?.WebPubliseres === false) continue;

    const eventId = item?.ArrangementUID;
    const eventName = item?.ArrangementNavn;
    const dateStr = item?.ArrangementDato;

    const raceId = item?.EtappeUID;
    const raceName = item?.EtappeNavn ?? "Etappe";

    const timeMs = typeof item?.Tid === "number" ? item.Tid : null;
    if (!eventId || !eventName || !timeMs) continue;

    const startDate = dateStr ? new Date(dateStr) : null;

    const eventRow = await prisma.events.upsert({
      where: {
        source_id_source_event_id: { source_id: source.id, source_event_id: String(eventId) },
      },
      update: { name: String(eventName), start_date: startDate, updated_at: new Date() },
      create: {
        source_id: source.id,
        source_event_id: String(eventId),
        name: String(eventName),
        start_date: startDate,
        updated_at: new Date(),
      },
    });

    const raceRow = await prisma.races.upsert({
      where: {
        event_id_source_race_id: { event_id: eventRow.id, source_race_id: String(raceId ?? raceName) },
      },
      update: { name: String(raceName) },
      create: {
        event_id: eventRow.id,
        source_race_id: String(raceId ?? raceName),
        name: String(raceName),
        distance_m: null,
      },
    });

    const distanceCategory = classifyDistance(raceName, eventName);

    await prisma.results.upsert({
      where: {
        race_id_athlete_id_time_ms: { race_id: raceRow.id, athlete_id: athleteId, time_ms: timeMs },
      },
      update: {
        rank_overall: item?.Plassering ?? null,
        raw: item,
        distance_category: distanceCategory,
      },
      create: {
        race_id: raceRow.id,
        athlete_id: athleteId,
        time_ms: timeMs,
        rank_overall: item?.Plassering ?? null,
        raw: item,
        distance_category: distanceCategory,
      },
    });

    inserted++;
  }

  return Response.json({ ok: true, athleteId, inserted });
}