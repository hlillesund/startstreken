import { prisma } from "@/lib/prisma";

function stripBom(s: string) {
  return s.replace(/^\uFEFF/, "");
}

function clean(v: string | undefined | null) {
  if (!v) return "";
  return v.replace(/^"+|"+$/g, "").trim();
}

function parseCsvSemicolon(csvText: string) {
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = "";
  let inQuotes = false;

  const pushCell = () => { cur.push(cell); cell = ""; };
  const pushRow  = () => {
    if (cur.length > 1 || (cur.length === 1 && cur[0].trim() !== "")) rows.push(cur);
    cur = [];
  };

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    if (inQuotes) {
      if (ch === '"') {
        const next = csvText[i + 1];
        if (next === '"') { cell += '"'; i++; } else inQuotes = false;
      } else { cell += ch; }
      continue;
    }
    if (ch === '"')  { inQuotes = true; continue; }
    if (ch === ";")  { pushCell(); continue; }
    if (ch === "\n") { pushCell(); pushRow(); continue; }
    if (ch === "\r") continue;
    cell += ch;
  }
  pushCell();
  pushRow();
  return rows;
}

function parseTimeToMs(t: string): number | null {
  if (!t) return null;
  const parts = t.split(":").map(Number);
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  return null;
}

export async function POST(req: Request) {
  const body    = await req.json().catch(() => ({}));
  const eventId = Number(body.eventId);
  const reportId = Number(body.reportId);

  if (!eventId || !reportId) {
    return Response.json({ error: "Need eventId + reportId" }, { status: 400 });
  }

  const source = await prisma.sources.findUnique({ where: { slug: "eqtiming" } });
  if (!source) return Response.json({ error: "Missing eqtiming source" }, { status: 500 });

  // Fetch CSV
  const url = `https://live.eqtiming.com/api//Report/${reportId}?eventId=${eventId}`;
  const res = await fetch(url, {
    headers: {
      Accept: "text/csv,*/*",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `https://live.eqtiming.com/${eventId}`,
    },
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    return Response.json({ error: "CSV fetch failed", body: text.slice(0, 200) }, { status: 500 });
  }

  const rows   = parseCsvSemicolon(text);
  const header = rows[0].map((h) => stripBom(clean(h)).toLowerCase());

  // ── Column detection ────────────────────────────────────────────────────
  const idxBib   = header.findIndex((h) => h.includes("startnumber"));
  const idxRace  = header.findIndex((h) => h === "race");
  const idxTime  = header.findIndex((h) => h.includes("total time"));
  const idxDiff  = header.findIndex((h) => h.includes("diff winner"));



  if (idxBib === -1 || idxRace === -1 || idxTime === -1) {
    return Response.json({ error: "Missing required columns", header });
  }

  const event = await prisma.events.findFirst({
    where: { source_id: source.id, source_event_id: String(eventId) },
  });
  if (!event) {
    return Response.json({ error: "Event not imported yet" }, { status: 400 });
  }

  // Pre-load startlist + identities
  const startEntries = await prisma.eq_startlist_entries.findMany({
    where:  { source_id: source.id, event_id: eventId },
    select: { bib: true, participant_uid: true },
  });
  const bibToUid = new Map(startEntries.map((e) => [e.bib, e.participant_uid]));

  const allUids    = [...new Set(startEntries.map((e) => e.participant_uid))];
  const identities = await prisma.athlete_identities.findMany({
    where:  { source_id: source.id, source_person_id: { in: allUids } },
    select: { source_person_id: true, athlete_id: true },
  });
  const uidToAthlete = new Map(identities.map((i) => [i.source_person_id, i.athlete_id]));

  // Upsert races
  const raceNames = new Set<string>();
  for (const r of rows.slice(1)) {
    const raceName = clean(r[idxRace]);
    if (raceName) raceNames.add(raceName);
  }

  const raceIdMap = new Map<string, string>();
  for (const raceName of raceNames) {
    let race = await prisma.races.findFirst({ where: { event_id: event.id, name: raceName } });
    if (!race) race = await prisma.races.create({ data: { event_id: event.id, name: raceName } });
    raceIdMap.set(raceName, race.id);
  }

  // Wipe existing results and re-insert
  const raceIds = [...raceIdMap.values()];
  await prisma.results.deleteMany({ where: { race_id: { in: raceIds } } });

  // Build insert rows
  const toInsert: any[] = [];
  let skipped = 0;

  for (const r of rows.slice(1)) {
    const bib        = clean(r[idxBib]);
    const raceName   = clean(r[idxRace]);
    const timeStr    = clean(r[idxTime]);
    const diffWinner = idxDiff !== -1 ? clean(r[idxDiff]) : null;

    if (!bib || !raceName || !timeStr) continue;
    if (idxDiff !== -1 && !diffWinner)  continue;

    const timeMs = parseTimeToMs(timeStr);
    if (!timeMs) continue;

    const raceId    = raceIdMap.get(raceName);
    if (!raceId)    { skipped++; continue; }

    const uid       = bibToUid.get(bib);
    if (!uid)       { skipped++; continue; }

    const athleteId = uidToAthlete.get(uid);
    if (!athleteId) { skipped++; continue; }

    toInsert.push({
      race_id:    raceId,
      athlete_id: athleteId,
      time_ms:    timeMs,
      bib,
      raw: { source: "eqtiming", eventId, raceName, reportId },
    });
  }

  // Insert in chunks
  let inserted = 0;
  const CHUNK  = 500;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const res = await prisma.results.createMany({
      data:           toInsert.slice(i, i + CHUNK),
      skipDuplicates: true,
    });
    inserted += res.count;
  }

  // ── Recompute gender ranks for all affected races ──────────────────────
  // Uses the DB function which partitions by race_id + distance_category + gender
  for (const raceId of raceIds) {
    await prisma.$executeRawUnsafe(
      `SELECT public.recompute_rank_gender($1::uuid)`,
      raceId
    );
  }

  return Response.json({ ok: true, inserted, skipped });
}