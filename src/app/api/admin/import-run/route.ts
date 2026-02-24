import { prisma } from "@/lib/prisma";
import { applyOverrides, ImportOverride } from "@/lib/apply-overrides";

import { fetchRaceResultListAllRaw } from "@/lib/raceresult";
import { parseRaceResultListFromPages } from "@/lib/raceresult-parse";
import { resolveAthleteForIdentity } from "@/lib/athlete-merge";

import { fetchUltimateResultsAllRaw } from "@/lib/ultimate";
import { parseUltimateResultsFromPages } from "@/lib/ultimate-parse";

type Body =
  | {
      sourceSlug: "raceresult";
      params: {
        eventId: number;
        key: string;
        listName: string;
        contest: number;
        filter: string;
      };
      override?: ImportOverride;
    }
  | {
      sourceSlug: "ultimate";
      params: {
        eventId: number;
        distance?: number | null;
      };
      override?: ImportOverride;
    }
  | {
      sourceSlug: "eqtiming";
      params: { eventId: number };
      override?: ImportOverride;
    };

function timeToMs(time: string): number | null {
  if (!time) return null;
  const parts = time.trim().split(":").map(Number);
  if (parts.some(Number.isNaN)) return null;

  let h = 0,
    m = 0,
    s = 0;

  if (parts.length === 3) [h, m, s] = parts;
  else if (parts.length === 2) [m, s] = parts;
  else return null;

  return (h * 3600 + m * 60 + s) * 1000;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return Response.json({ error: "Bad JSON" }, { status: 400 });

  const sourceSlug = body.sourceSlug;
  const override = body.override ?? {};

  const source = await prisma.sources.findUnique({
    where: { slug: sourceSlug },
  });

  if (!source) {
    return Response.json({ error: `Missing source ${sourceSlug}` }, { status: 500 });
  }

  /* ---------------- RACERESULT ---------------- */

  if (sourceSlug === "raceresult") {
    const { eventId, key, listName, contest, filter } = body.params;

    const pages = await fetchRaceResultListAllRaw(
      eventId,
      key,
      listName,
      contest,
      filter
    );

    const rows = parseRaceResultListFromPages(pages);

    const eventRow = await prisma.events.upsert({
      where: {
        source_id_source_event_id: {
          source_id: source.id,
          source_event_id: String(eventId),
        },
      },
      update: { updated_at: new Date() },
      create: {
        source_id: source.id,
        source_event_id: String(eventId),
        name: `RaceResult event ${eventId}`,
        updated_at: new Date(),
      },
      select: { id: true },
    });

    const sourceRaceId = `${listName}|${contest}|${filter}`;

    const raceRow = await prisma.races.upsert({
      where: {
        event_id_source_race_id: {
          event_id: eventRow.id,
          source_race_id: sourceRaceId,
        },
      },
      update: { name: `RaceResult ${listName} ${filter}` },
      create: {
        event_id: eventRow.id,
        source_race_id: sourceRaceId,
        name: `RaceResult ${listName} ${filter}`,
        distance_m: null,
      },
      select: { id: true },
    });

    let imported = 0;

    for (const r of rows) {
      const timeMs = r.timeStr ? timeToMs(r.timeStr) : null;
      if (!r.name || !timeMs) continue;

      const personId = `rr:${eventId}:${sourceRaceId}:${r.bib ?? ""}:${r.name}`;

      const resolved = await resolveAthleteForIdentity({
        sourceSlug: "raceresult",
        sourcePersonId: personId,
        displayName: r.name,
        club: r.club ?? null,
        payload: r,
      });

      await prisma.results.upsert({
        where: {
          race_id_athlete_id_time_ms: {
            race_id: raceRow.id,
            athlete_id: resolved.athleteId,
            time_ms: timeMs,
          },
        },
        update: {
          rank_overall: r.rank ?? null,
          bib: r.bib ?? null,
          club: r.club ?? null,
          raw: r as any,
        },
        create: {
          race_id: raceRow.id,
          athlete_id: resolved.athleteId,
          time_ms: timeMs,
          rank_overall: r.rank ?? null,
          bib: r.bib ?? null,
          club: r.club ?? null,
          raw: r as any,
        },
      });

      imported++;
    }

    const applied = await applyOverrides({
      sourceSlug,
      sourceEventId: String(eventId),
      sourceRaceId,
      override,
    });

    return Response.json({ ok: true, imported, overrides: applied });
  }

  /* ---------------- ULTIMATE ---------------- */

  if (sourceSlug === "ultimate") {
    const { eventId, distance } = body.params;

    const pages = await fetchUltimateResultsAllRaw(eventId, distance ?? null);
    const rows = parseUltimateResultsFromPages(pages);

    const eventRow = await prisma.events.upsert({
      where: {
        source_id_source_event_id: {
          source_id: source.id,
          source_event_id: String(eventId),
        },
      },
      update: { updated_at: new Date() },
      create: {
        source_id: source.id,
        source_event_id: String(eventId),
        name: `Ultimate event ${eventId}`,
        updated_at: new Date(),
      },
      select: { id: true },
    });

    const sourceRaceId = String(distance ?? "default");

    const raceRow = await prisma.races.upsert({
      where: {
        event_id_source_race_id: {
          event_id: eventRow.id,
          source_race_id: sourceRaceId,
        },
      },
      update: { name: `Ultimate ${sourceRaceId}` },
      create: {
        event_id: eventRow.id,
        source_race_id: sourceRaceId,
        name: `Ultimate ${sourceRaceId}`,
        distance_m: null,
      },
      select: { id: true },
    });

    let imported = 0;

    for (const r of rows) {
      if (!r.name || !r.timeStr) continue;

      const timeMs = timeToMs(r.timeStr);
      if (!timeMs) continue;

      const personId = `ult:${eventId}:${r.name}`;

      const resolved = await resolveAthleteForIdentity({
        sourceSlug: "ultimate",
        sourcePersonId: personId,
        displayName: r.name,
        club: r.club ?? null,
        payload: r,
      });

      await prisma.results.upsert({
        where: {
          race_id_athlete_id_time_ms: {
            race_id: raceRow.id,
            athlete_id: resolved.athleteId,
            time_ms: timeMs,
          },
        },
        update: {
          rank_overall: r.rank ?? null,
          bib: r.bib ?? null,
          club: r.club ?? null,
          raw: r as any,
        },
        create: {
          race_id: raceRow.id,
          athlete_id: resolved.athleteId,
          time_ms: timeMs,
          rank_overall: r.rank ?? null,
          bib: r.bib ?? null,
          club: r.club ?? null,
          raw: r as any,
        },
      });

      imported++;
    }

    const applied = await applyOverrides({
      sourceSlug,
      sourceEventId: String(eventId),
      sourceRaceId,
      override,
    });

    return Response.json({ ok: true, imported, overrides: applied });
  }

  /* ---------------- EQTIMING ---------------- */

  if (sourceSlug === "eqtiming") {
    const { eventId } = body.params;

    const eventRow = await prisma.events.upsert({
      where: {
        source_id_source_event_id: {
          source_id: source.id,
          source_event_id: String(eventId),
        },
      },
      update: { updated_at: new Date() },
      create: {
        source_id: source.id,
        source_event_id: String(eventId),
        name: `EQTiming event ${eventId}`,
        updated_at: new Date(),
      },
      select: { id: true },
    });

    const sourceRaceId = "event";

    await prisma.races.upsert({
      where: {
        event_id_source_race_id: {
          event_id: eventRow.id,
          source_race_id: sourceRaceId,
        },
      },
      update: {},
      create: {
        event_id: eventRow.id,
        source_race_id: sourceRaceId,
        name: "EQTiming",
        distance_m: null,
      },
    });

    const applied = await applyOverrides({
      sourceSlug,
      sourceEventId: String(eventId),
      sourceRaceId,
      override,
    });

    return Response.json({
      ok: true,
      note: "EQ event skeleton created",
      overrides: applied,
    });
  }

  return Response.json({ error: "Unsupported sourceSlug" }, { status: 400 });
}