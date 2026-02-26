import { prisma } from "@/lib/prisma";
import { fetchEqTotalResultsPage } from "@/lib/eqtiming-results";

type DistanceCategory = "5K" | "10K" | "HM" | "M" | "OTHER";

function normName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function classifyFromRaceName(name: string): DistanceCategory {
  const t = (name ?? "").toLowerCase();
  if (t.includes("halv") || t.includes("half")) return "HM";
  if (t.includes("maraton") || t.includes("marathon")) return "M";
  if (/\b10\s*(km|k)\b/.test(t) || t.includes("10km")) return "10K";
  if (/\bmil(a|en)?\b/.test(t)) return "10K";
  if (/\b5\s*(km|k)\b/.test(t) || t.includes("5km") || /\b5000\b/.test(t)) return "5K";
  return "OTHER";
}

// prøv å hente navn + uid fra en result-row (du må kanskje justere keys etter sample)
function pickName(row: any): string | null {
  // typiske felt i EQ: NameFormatted / NavnFormatert / FullName / Name
  const direct =
    row?.NameFormatted ??
    row?.NavnFormatert ??
    row?.FullName ??
    row?.Name ??
    row?.AthleteName ??
    null;

  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const fn = (row?.FirstName ?? row?.Fornavn ?? "").toString().trim();
  const ln = (row?.LastName ?? row?.Etternavn ?? "").toString().trim();
  const combined = `${fn} ${ln}`.trim();
  return combined.length >= 2 ? combined : null;
}

function pickUid(row: any): string | null {
  // typisk: AthleteId / UID / UtoverUID / ParticipantId
  const uid = row?.UID ?? row?.AthleteId ?? row?.UtoverUID ?? row?.ParticipantId ?? row?.Id ?? null;
  if (uid === null || uid === undefined) return null;
  return String(uid);
}

function pickTimeMs(row: any): number | null {
  // typisk: Time / Tid / TimeMs / ResultTime
  const ms = row?.TimeMs ?? row?.Tid ?? row?.Time ?? row?.ResultTimeMs ?? null;
  if (typeof ms === "number" && Number.isFinite(ms) && ms > 0) return ms;

  // noen ganger kommer det som string "HH:MM:SS"
  const ts = row?.TimeFormatted ?? row?.TidFormatert ?? row?.TimeString ?? null;
  if (typeof ts === "string" && ts.trim()) {
    const parts = ts.trim().split(":").map(Number);
    if (parts.some((n: number) => Number.isNaN(n))) return null;
    let h = 0, m = 0, s = 0;
    if (parts.length === 3) [h, m, s] = parts;
    else if (parts.length === 2) [m, s] = parts;
    else [s] = parts;
    return (h * 3600 + m * 60 + s) * 1000;
  }

  return null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const eventId = Number(body.eventId);
  const classId = Number(body.classId);
  const station = body.station === undefined || body.station === null ? null : Number(body.station);

  const eventName = typeof body.eventName === "string" ? body.eventName : null;
  const raceName = typeof body.raceName === "string" ? body.raceName : null;
  const distanceCategory = (body.distanceCategory as DistanceCategory | undefined) ?? null;

  if (!Number.isFinite(eventId) || !Number.isFinite(classId)) {
    return Response.json({ error: "Need eventId + classId (numbers)" }, { status: 400 });
  }

  const pageSize = Number(body.pageSize ?? 200);
  if (!Number.isFinite(pageSize) || pageSize <= 0) {
    return Response.json({ error: "pageSize must be > 0" }, { status: 400 });
  }

  const source = await prisma.sources.findUnique({ where: { slug: "eqtiming" } });
  if (!source) return Response.json({ error: "Missing sources row for eqtiming" }, { status: 500 });

  // 1) event + race upfront (slipper upsert per row)
  const eventRow = await prisma.events.upsert({
    where: {
      source_id_source_event_id: { source_id: source.id, source_event_id: String(eventId) },
    },
    update: {
      name: eventName ?? `EQTiming event ${eventId}`,
      updated_at: new Date(),
    },
    create: {
      source_id: source.id,
      source_event_id: String(eventId),
      name: eventName ?? `EQTiming event ${eventId}`,
      start_date: null,
      location: null,
      updated_at: new Date(),
    },
    select: { id: true },
  });

  // source_race_id: bruk classId som stabil ID (best)
  const raceRow = await prisma.races.upsert({
    where: {
      event_id_source_race_id: { event_id: eventRow.id, source_race_id: String(classId) },
    },
    update: { name: raceName ?? `Class ${classId}` },
    create: {
      event_id: eventRow.id,
      source_race_id: String(classId),
      name: raceName ?? `Class ${classId}`,
      distance_m: null,
    },
    select: { id: true },
  });

  let startAt = 1;
  let inserted = 0;
  let skipped = 0;

  while (true) {
    const data = await fetchEqTotalResultsPage({
      eventId,
      classId,
      station,
      startAt,
      count: pageSize,
      justTimeData: true,
      passes: false,
      round: 1,
      query: "",
    });

    // finn items-array
    const items: any[] =
      Array.isArray(data) ? data
      : Array.isArray((data as any)?.Items) ? (data as any).Items
      : Array.isArray((data as any)?.Rows) ? (data as any).Rows
      : (data as any)?.Items && typeof (data as any).Items === "object" ? Object.values((data as any).Items)
      : [];

    if (items.length === 0) break;

    for (const row of items) {
      const name = pickName(row);
      const uid = pickUid(row);
      const timeMs = pickTimeMs(row);

      if (!name || !uid || !timeMs) {
        skipped++;
        continue;
      }

      // athlete + identity
      const athlete = await prisma.athletes.upsert({
        where: { display_name_norm: normName(name) },
        update: { display_name: name },
        create: { display_name: name, display_name_norm: normName(name) },
        select: { id: true },
      });

      await prisma.athlete_identities.upsert({
        where: {
          source_id_source_person_id: {
            source_id: source.id,
            source_person_id: uid,
          },
        },
        update: { athlete_id: athlete.id },
        create: { athlete_id: athlete.id, source_id: source.id, source_person_id: uid },
      });

      const desired = distanceCategory ?? classifyFromRaceName(raceName ?? "");

      await prisma.results.upsert({
        where: {
          race_id_athlete_id_time_ms: {
            race_id: raceRow.id,
            athlete_id: athlete.id,
            time_ms: timeMs,
          },
        },
        update: {
          raw: row,
          distance_category: desired,
          // rank_overall: map hvis du finner felt i row (typisk Plass / Rank)
          rank_overall: row?.Rank ?? row?.Plass ?? row?.Place ?? null,
        },
        create: {
          race_id: raceRow.id,
          athlete_id: athlete.id,
          time_ms: timeMs,
          raw: row,
          distance_category: desired,
          rank_overall: row?.Rank ?? row?.Plass ?? row?.Place ?? null,
          bib: null,
          club: row?.Club ?? row?.Lag ?? row?.Team ?? null,
        },
      });

      inserted++;
    }

    startAt += pageSize;
    if (items.length < pageSize) break;
  }

  return Response.json({ ok: true, eventId, classId, inserted, skipped });
}