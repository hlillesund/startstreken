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

  const pushCell = () => {
    cur.push(cell);
    cell = "";
  };

  const pushRow = () => {
    if (cur.length > 1 || (cur.length === 1 && cur[0].trim() !== "")) {
      rows.push(cur);
    }
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

function parseTimeToMs(t: string) {
  if (!t) return null;

  // 37:32 eller 1:23:45
  const parts = t.split(":").map(Number);

  if (parts.length === 2) {
    const [m, s] = parts;
    return (m * 60 + s) * 1000;
  }

  if (parts.length === 3) {
    const [h, m, s] = parts;
    return (h * 3600 + m * 60 + s) * 1000;
  }

  return null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const eventId = Number(body.eventId);
  const reportId = Number(body.reportId);

  if (!eventId || !reportId) {
    return Response.json({ error: "Need eventId + reportId" }, { status: 400 });
  }

  const source = await prisma.sources.findUnique({
    where: { slug: "eqtiming" },
  });

  if (!source) {
    return Response.json({ error: "Missing eqtiming source" }, { status: 500 });
  }

  // fetch CSV
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

  const rows = parseCsvSemicolon(text);

  const header = rows[0].map((h) => stripBom(clean(h)).toLowerCase());

  const idxBib = header.findIndex((h) => h.includes("startnumber"));
  const idxRace = header.findIndex((h) => h === "race");
  const idxTime = header.findIndex((h) => h.includes("total time"));
    const idxDiff = header.findIndex((h) => h.includes("diff winner")); // NY


  if (idxBib === -1 || idxRace === -1 || idxTime === -1) {
    return Response.json({ error: "Missing required columns", header });
  }

  const event = await prisma.events.findFirst({
    where: {
      source_id: source.id,
      source_event_id: String(eventId),
    },
  });

  if (!event) {
    return Response.json({ error: "Event not imported yet" }, { status: 400 });
  }

  let inserted = 0;
  let skipped = 0;

  for (const r of rows.slice(1)) {
    const bib = clean(r[idxBib]);
    const raceName = clean(r[idxRace]);
    const timeStr = clean(r[idxTime]);
        const diffWinner = idxDiff !== -1 ? clean(r[idxDiff]) : null; // NY


    if (!bib || !raceName || !timeStr) continue;
        if (idxDiff !== -1 && !diffWinner) continue;


    const timeMs = parseTimeToMs(timeStr);
    if (!timeMs) continue;

    // find race
    let race = await prisma.races.findFirst({
      where: {
        event_id: event.id,
        name: raceName,
      },
    });

    if (!race) {
      race = await prisma.races.create({
        data: {
          event_id: event.id,
          name: raceName,
        },
      });
    }

    // match via startlist
    const entry = await prisma.eq_startlist_entries.findFirst({
      where: {
        source_id: source.id,
        event_id: eventId,
        bib,
      },
    });

    if (!entry) {
      skipped++;
      continue;
    }

    const identity = await prisma.athlete_identities.findUnique({
      where: {
        source_id_source_person_id: {
          source_id: source.id,
          source_person_id: entry.participant_uid,
        },
      },
    });

    if (!identity) {
      skipped++;
      continue;
    }
await prisma.results.upsert({
  where: {
    race_id_athlete_id_time_ms: {
      race_id: race.id,
      athlete_id: identity.athlete_id,
      time_ms: timeMs,
    },
  },
  update: {},
  create: {
    race_id: race.id,
    athlete_id: identity.athlete_id,
    time_ms: timeMs,
    bib,
    raw: { raceName },
  },
});

    inserted++;
  }

  return Response.json({
    ok: true,
    inserted,
    skipped,
  });
}