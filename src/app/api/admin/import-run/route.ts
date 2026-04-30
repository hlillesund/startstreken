import { prisma } from "@/lib/prisma";
import { importEqStartlistBatch } from "@/lib/eq-batch-import";
import { applyOverrides, ImportOverride } from "@/lib/apply-overrides";
import { importUltimateBatch } from "@/lib/ultimate-batch-import";
import { fetchRaceResultListAllRaw } from "@/lib/raceresult";
import { parseRaceResultListFromPages } from "@/lib/raceresult-parse";
import { resolveAthleteForIdentity } from "@/lib/athlete-merge";

import { fetchUltimateResultsAllRaw } from "@/lib/ultimate";
import { parseUltimateResultsFromPages } from "@/lib/ultimate-parse";

import { fetchEqStartlistPage } from "@/lib/eqtiming-startlist";
import { classifyFromRaceName, applySanity, DistanceCategory } from "@/lib/distance-category";



function inferUltimateCategory(args: {
  overrideCat: any;
  presetCat: any;
  raceName?: string | null;
  sourceRaceId?: string | null;
}): DistanceCategory {
  const o = args.overrideCat ?? null;
  if (o) return o;

  const p = args.presetCat ?? null;
  if (p) return p;

  const name = (args.raceName ?? "").toLowerCase();
  if (name.includes("halv") || name.includes("half")) return "HM";
  if (name.includes("maraton") || name.includes("marathon")) return "M";
  if (/\b10\s*(km|k)\b/.test(name) || name.includes("10km")) return "10K";
  if (/\b5\s*(km|k)\b/.test(name) || name.includes("5km") || /\b5000\b/.test(name)) return "5K";

  return "OTHER";
}

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

/* ---------------- EQ HELPERS ---------------- */

const EQ_RESULT_REPORT_ID = 347;

function stripBom(s: string) {
  return s.replace(/^\uFEFF/, "");
}
function clean(v: string | undefined | null) {
  if (!v) return "";
  return v.replace(/^"+|"+$/g, "").trim();
}

// EQ report CSV er ofte semikolon + quotes
function parseCsvSemicolon(csvText: string) {
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = "";
  let inQuotes = false;

  const pushCell = () => {
    cur.push(cell);
    cell = "";
  };
  const pushRow = () => {
    if (cur.length > 1 || (cur.length === 1 && cur[0].trim() !== "")) rows.push(cur);
    cur = [];
  };

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = csvText[i + 1];
        if (next === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ";") {
      pushCell();
      continue;
    }

    if (ch === "\n") {
      pushCell();
      pushRow();
      continue;
    }

    if (ch === "\r") continue;

    cell += ch;
  }

  pushCell();
  pushRow();
  return rows;
}

function parseTimeToMsLoose(t: string): number | null {
  const s = clean(t);
  if (!s) return null;

  // f.eks "39:03.0" -> "39:03"
  const plain = s.split(".")[0];
  const parts = plain.split(":").map((x) => Number(x));
  if (parts.some(Number.isNaN)) return null;

  if (parts.length === 2) {
    const [m, sec] = parts;
    return (m * 60 + sec) * 1000;
  }
  if (parts.length === 3) {
    const [h, m, sec] = parts;
    return (h * 3600 + m * 60 + sec) * 1000;
  }
  return null;
}

function normName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
function getNameFromStartlist(p: any): string | null {
  const u = p?.Utover ?? p?.utover ?? p?.Athlete ?? null;
  const direct = u?.NavnFormatert ?? u?.NameFormatted ?? u?.FullName;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const fn = (u?.Fornavn ?? u?.FirstName ?? "").toString().trim();
  const ln = (u?.Etternavn ?? u?.LastName ?? "").toString().trim();
  const combined = `${fn} ${ln}`.trim();
  return combined.length >= 2 ? combined : null;
}
function getUidFromStartlist(p: any): string | null {
  const uid = p?.Utover?.UID ?? p?.Utover?.Id ?? null;
  if (uid === null || uid === undefined) return null;
  const s = String(uid).trim();
  return s ? s : null;
}
function getBibFromStartlist(p: any): string | null {
  const v = p?.Startnummer ?? p?.FullStartnummer ?? null;
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}
function getClassNameFromStartlist(p: any): string | null {
  const c = p?.Klasse?.Navn ?? null;
  if (typeof c !== "string") return null;
  const t = c.trim();
  return t ? t : null;
}

async function importEqStartlistIntoDb(sourceId: string, eventId: number) {
  const pageSize = 200;
  let startAt = 1;

  let imported = 0;
  let pages = 0;

  while (true) {
    const data = await fetchEqStartlistPage(eventId, startAt, pageSize);

    const items: any[] = Array.isArray(data)
      ? data
      : Array.isArray((data as any)?.Items)
        ? (data as any).Items
        : (data as any)?.Items && typeof (data as any).Items === "object"
          ? Object.values((data as any).Items)
          : Array.isArray((data as any)?.Rows)
            ? (data as any).Rows
            : [];

    if (items.length === 0) break;

    // dedup per page (samme UID kan dukke opp flere ganger)
    const seen = new Set<string>();
    const deduped: any[] = [];
    for (const p of items) {
      const uid = p?.Utover?.UID ?? p?.Utover?.Id ?? p?.UID ?? null;
      if (!uid) continue;
      const key = String(uid).trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(p);
    }

const result = await importEqStartlistBatch(sourceId, eventId, deduped);
imported += result.imported;

    pages++;
    startAt += pageSize;
    if (items.length < pageSize) break;
  }

  return { pages, imported };
}

async function fetchEqResultsReportCsv(eventId: number, reportId: number) {
  const url = `https://live.eqtiming.com/api//Report/${reportId}?eventId=${eventId}`;
  const res = await fetch(url, {
    headers: {
      Accept: "text/csv,application/octet-stream,*/*",
      "X-Requested-With": "XMLHttpRequest",
      "EQLiveLocale": "nb-NO",
      Referer: `https://live.eqtiming.com/${eventId}`,
    },
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`EQ report fetch failed: ${res.status} ${res.statusText} body=${text.slice(0, 200)}`);
  }

  const rows = parseCsvSemicolon(text);
  if (rows.length < 2) {
    throw new Error(`EQ report ${reportId} for event ${eventId} had no rows`);
  }

  const header = rows[0].map((h) => stripBom(clean(h)).toLowerCase());
    console.log("[eqtiming] FULL HEADER:", JSON.stringify(header));

  const idxBib = header.findIndex((h) => h.includes("startnumber"));
  const idxRace = header.findIndex((h) => h === "race");
  const idxTime = header.findIndex((h) => h.includes("total time"));
    const idxDiff = header.findIndex((h) => h.includes("diff winner")); // NY
  console.log("[eqtiming] idxBib:", idxBib, "idxRace:", idxRace, "idxTime:", idxTime, "idxDiff:", idxDiff);


  if (idxBib === -1 || idxRace === -1 || idxTime === -1) {
    throw new Error(
      `EQ report ${reportId} for event ${eventId} mangler nødvendige kolonner (Startnumber/Race/Total Time). Header=${JSON.stringify(
        header
      )}`
    );
  }

  return { url, text, rows, header, idxBib, idxRace, idxTime, idxDiff};
}

/* ---------------- ROUTE ---------------- */

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

    const pages = await fetchRaceResultListAllRaw(eventId, key, listName, contest, filter);
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

const source = await prisma.sources.findUnique({ where: { slug: "ultimate" } });
if (!source) throw new Error("Missing sources row for ultimate");

const sourceEventId = String(eventId);
const sourceRaceId = String(distance);

const preset = await prisma.import_presets.findUnique({
  where: {
    source_id_source_event_id_source_race_id: {
      source_id: source.id,
      source_event_id: sourceEventId,
      source_race_id: sourceRaceId,
    },
  },
  select: {
    event_name: true,
    start_date: true,
    location: true,
    race_name: true,
    distance_m: true,
    distance_category: true,
  },
});

const desiredEventName = override.event_name ?? preset?.event_name ?? `Ultimate event ${eventId}`;
const desiredStartDate = override.start_date ?? (preset?.start_date ? preset.start_date.toISOString().slice(0,10) : null);
const desiredLocation = override.location ?? preset?.location ?? null;

const desiredRaceName = override.race_name ?? preset?.race_name ?? `Distance ${sourceRaceId}`;
const desiredDistanceM =
  override.distance_m !== undefined ? override.distance_m : (preset?.distance_m ?? null);

const desiredCategory =
  override.distance_category ?? preset?.distance_category ?? null;

// event
const eventRow = await prisma.events.upsert({
  where: {
    source_id_source_event_id: {
      source_id: source.id,
      source_event_id: sourceEventId,
    },
  },
  update: {
    name: desiredEventName,
    start_date: desiredStartDate ? new Date(desiredStartDate) : undefined,
    location: desiredLocation ?? undefined,
    updated_at: new Date(),
  },
  create: {
    source_id: source.id,
    source_event_id: sourceEventId,
    name: desiredEventName,
    start_date: desiredStartDate ? new Date(desiredStartDate) : null,
    location: desiredLocation,
    updated_at: new Date(),
  },
  select: { id: true },
});

// race
const raceRow = await prisma.races.upsert({
  where: {
    event_id_source_race_id: {
      event_id: eventRow.id,
      source_race_id: sourceRaceId,
    },
  },
  update: {
    name: desiredRaceName,
    distance_m: desiredDistanceM === null ? null : desiredDistanceM ?? undefined,
  },
  create: {
    event_id: eventRow.id,
    source_race_id: sourceRaceId,
    name: desiredRaceName,
    distance_m: desiredDistanceM,
  },
  select: { id: true },
});

  // 4) importer resultater
  const { imported, skipped } = await importUltimateBatch({
  rows,
  raceId: raceRow.id,
  distanceCategory: desiredCategory ?? null,
  sourceId: source.id,
});

  return Response.json({
    ok: true,
    eventId,
    sourceEventId,
    sourceRaceId,
    imported,
    skipped,
    presetUsed: preset ?? null,
    appliedFrom: {
      event_name: desiredEventName,
      start_date: desiredStartDate,
      location: desiredLocation,
      race_name: desiredRaceName,
      distance_m: desiredDistanceM,
      distance_category: desiredCategory,
    },
  });
}
/* ---------------- EQTIMING (reportId = 347) ---------------- */

type DistanceCategory = "5K" | "10K" | "HM" | "M" | "OTHER";

function normRaceId(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

if (sourceSlug === "eqtiming") {
  const { eventId } = body.params;

const rawSample = await fetchEqStartlistPage(eventId, 1, 1) as Record<string, any>;
const firstItem = rawSample?.Items?.["0"] ?? Object.values(rawSample?.Items ?? {})[0] ?? null;
const arrangement = firstItem?.Arrangement ?? null;

  const apiEventName = arrangement?.Navn?.trim() ?? null;
  const apiEventDate = arrangement?.Dato
    ? arrangement.Dato.slice(0, 10)   // "2026-03-23"
    : null;

  // Override > API > placeholder
  const desiredName     = (override as any).event_name ?? apiEventName ?? `EQTiming event ${eventId}`;
  const desiredDate     = (override as any).start_date ?? apiEventDate ?? null;
  const desiredLocation = (override as any).location ?? null;

  // 0) upsert events row with real name
  const eventRow = await prisma.events.upsert({
    where: {
      source_id_source_event_id: {
        source_id: source.id,
        source_event_id: String(eventId),
      },
    },
    update: {
      name:       desiredName,
      start_date: desiredDate ? new Date(desiredDate) : undefined,
      ...(desiredLocation ? { location: desiredLocation } : {}),
      updated_at: new Date(),
    },
    create: {
      source_id:       source.id,
      source_event_id: String(eventId),
      name:            desiredName,
      start_date:      desiredDate ? new Date(desiredDate) : null,
      location:        desiredLocation,
      updated_at:      new Date(),
    },
    select: { id: true },
  });
  // 1) importer startliste (bygger eq_startlist_entries + identiteter)
  const startlist = await importEqStartlistIntoDb(source.id, eventId);

  const rawFirstPage = await fetchEqStartlistPage(eventId, 1, 1);
console.log("[eqtiming] raw response keys:", Object.keys(rawFirstPage ?? {}));
console.log("[eqtiming] raw sample:", JSON.stringify(rawFirstPage).slice(0, 500));

  // 2) hent resultater fra report 347 (alltid)
  const reportId = EQ_RESULT_REPORT_ID; // 347
  const { url: reportUrl, rows, idxBib, idxRace, idxTime, idxDiff, header } =
    await fetchEqResultsReportCsv(eventId, reportId);

  if (!rows || rows.length < 2) {
    return Response.json({
      ok: true,
      eventId,
      startlist,
      reportId,
      reportUrl,
      header,
      note: "Ingen rader i CSV",
    });
  }

  // 2.5) Hent presets (event-only + race-level) for denne eventen
  // NB: i schema er source_race_id nullable (event-only = null)
  const presets = await prisma.import_presets.findMany({
    where: {
      source_id: source.id,
      source_event_id: String(eventId),
    },
    select: {
      source_race_id: true,
      distance_category: true,
      distance_m: true,
      race_name: true,
      event_name: true,
      start_date: true,
      location: true,
    },
  });

  const presetEvent = presets.find((p) => p.source_race_id == null) ?? null;
  const presetRaceMap = new Map<string, (typeof presets)[number]>();
  for (const p of presets) {
    if (p.source_race_id != null) presetRaceMap.set(String(p.source_race_id), p);
  }

  const resolvePreset = (raceKey: string) => presetRaceMap.get(raceKey) ?? presetEvent;

  // 3) Prefetch startlist bib->uid
  const startEntries = await prisma.eq_startlist_entries.findMany({
    where: { source_id: source.id, event_id: eventId },
    select: { bib: true, participant_uid: true },
  });

  const bibToUid = new Map<string, string>();
  for (const e of startEntries) bibToUid.set(e.bib, e.participant_uid);

  // 4) Prefetch identities uid->athleteId
  const uids = Array.from(new Set(startEntries.map((e) => e.participant_uid)));
  const identities = await prisma.athlete_identities.findMany({
    where: {
      source_id: source.id,
      source_person_id: { in: uids },
    },
    select: { source_person_id: true, athlete_id: true },
  });

  const uidToAthlete = new Map<string, string>();
  for (const i of identities) uidToAthlete.set(i.source_person_id, i.athlete_id);

  // 5) Lag/oppdater races fra CSV
  const raceCache = new Map<string, string>(); // raceKey(norm) -> raceId
  let racesTouched = 0;

  const raceNames = new Set<string>();
  for (const r of rows.slice(1)) {
    const rn = clean(r[idxRace]);
    if (rn) raceNames.add(rn);
  }

  for (const raceName of raceNames) {
    const raceKey = normRaceId(raceName);

    const preset = resolvePreset(raceKey);
    const displayName = (preset?.race_name ?? raceName) as string;

    const race = await prisma.races.upsert({
      where: {
        event_id_source_race_id: {
          event_id: eventRow.id,
          source_race_id: raceKey,
        },
      },
      update: {
        name: displayName,
        distance_m: (preset?.distance_m ?? null) as number | null,
      },
      create: {
        event_id: eventRow.id,
        source_race_id: raceKey,
        name: displayName,
        distance_m: (preset?.distance_m ?? null) as number | null,
      },
      select: { id: true },
    });

    racesTouched++;
    raceCache.set(raceKey, race.id);
  }

  const raceIds = Array.from(new Set(Array.from(raceCache.values())));

  // 6) SLETT gamle results for disse races (fikser duplikater fra tidligere import)
  await prisma.results.deleteMany({
    where: { race_id: { in: raceIds } },
  });

  // 7) Bygg nye results og insert i batches
  let inserted = 0;
  let skipped = 0;

  const toInsert: Array<{
    race_id: string;
    athlete_id: string;
    time_ms: number;
    bib: string;
    distance_category: string;
    raw: any;
  }> = [];

  for (const r of rows.slice(1)) {
    const bib = clean(r[idxBib]);
    const raceName = clean(r[idxRace]);
    const timeStr = clean(r[idxTime]);
        const diffWinner = idxDiff !== -1 ? clean(r[idxDiff]) : null; // NY


    if (!bib || !raceName || !timeStr) continue;
    if (idxDiff !== -1 && !diffWinner) continue;


    const timeMs = parseTimeToMsLoose(timeStr);
    if (!timeMs) continue;

    const raceKey = normRaceId(raceName);
    const raceId = raceCache.get(raceKey);
    if (!raceId) {
      skipped++;
      continue;
    }

    const uid = bibToUid.get(bib);
    if (!uid) {
      skipped++;
      continue;
    }

    const athleteId = uidToAthlete.get(uid);
    if (!athleteId) {
      skipped++;
      continue;
    }

    const preset = resolvePreset(raceKey);
    const inferred = classifyFromRaceName(raceName);
    const fromPreset = (preset?.distance_category ?? null) as DistanceCategory | null;

    const desired = applySanity((fromPreset ?? inferred) as DistanceCategory, timeMs, raceName);

    toInsert.push({
      race_id: raceId,
      athlete_id: athleteId,
      time_ms: timeMs,
      bib,
      distance_category: desired,
      raw: { source: "eqtiming", eventId, reportId, raceName },
    });
  }

  const BATCH = 500;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const chunk = toInsert.slice(i, i + BATCH);
    const res = await prisma.results.createMany({
      data: chunk,
    });
    inserted += res.count;
  }

  const applied = await applyOverrides({
    sourceSlug,
    sourceEventId: String(eventId),
    sourceRaceId: "event",
    override,
  });

  return Response.json({
    ok: true,
    eventId,
    startlist,
    reportId,
    reportUrl,
    header,
    racesTouched,
    inserted,
    skipped,
    overrides: applied,
  });
}
}