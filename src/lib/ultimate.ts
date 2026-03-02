import { parseUltimateResults } from "@/lib/ultimate-parse";


/**
 * Standard results-feed (som du har nå)
 * ✅ distance kan være null (best-effort). Hvis Ultimate krever distance,
 * vil dette bare gi 0 rows.
 */
export async function fetchUltimateResultsRaw(
  eventId: number,
  distance: number | null,
  language = "us",
  startRecord = 0
) {
  const url =
    `https://live.ultimate.dk/desktop/front/data.php?` +
    `eventid=${eventId}` +
    `&mode=results` +
    `&distance=${distance ?? ""}` +
    `&category=` +
    `&language=${language}` +
    `&results_startrecord=${startRecord}`;

  const res = await fetch(url, {
    headers: { Accept: "*/*" },
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Ultimate failed: ${res.status} ${res.statusText}`);
  return res.text();
}

export async function fetchUltimateResultsAllRaw(
  eventId: number,
  distance: number | null,
  language = "us",
  pageSize = 1000,
  maxPages = 200
) {
  const pages: string[] = [];
  let prevSig: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const startRecord = page * pageSize;

    const raw = await fetchUltimateResultsRaw(eventId, distance, language, startRecord);
    const rows = parseUltimateResults(raw);

    if (rows.length === 0) break;

    const first = rows[0];
    const last = rows[rows.length - 1];
    const sig =
      `${first?.bib ?? ""}|${first?.name ?? ""}|${first?.timeStr ?? ""}` +
      `__${last?.bib ?? ""}|${last?.name ?? ""}|${last?.timeStr ?? ""}`;

    if (prevSig && sig === prevSig) break;
    prevSig = sig;

    pages.push(raw);

    if (rows.length < pageSize) break;
  }

  return pages;
}


function ultimateHeaders() {
  return {
    Accept: "*/*",
    "User-Agent": "Mozilla/5.0",
    Referer: "https://live.ultimate.dk/",
  } as Record<string, string>;
}

/**
 * ✅ Advanced search: kun norske (NOR), valgfritt distansefilter.
 * FIX:
 *  - fjern search_sortby=[TIMEFIELD] (kan gi 0 rows)
 *  - prøv results_startrecord først, fallback til search_startrecord
 */
export async function fetchUltimateNorSearchRaw(
  eventId: number,
  distance: number | null = null,
  language = "us",
  startRecord = 0
) {
  const base =
    `https://live.ultimate.dk/desktop/front/data.php?` +
    `eventid=${eventId}` +
    `&mode=search` +
    `&searchmode=advanced` +
    `&search_quick=` +
    `&language=${language}` +
    `&search_bib=` +
    `&search_firstname=` +
    `&search_lastname=` +
    `&search_club=` +
    `&search_city=` +
    `&search_nation=NOR` +
    `&search_distance=${distance ?? ""}` +
    `&search_category=` +
    `&search_time=Finish` +
    `&search_sorttype=ASC`;

  // 1) prøv med results_startrecord
  {
    const url = `${base}&results_startrecord=${startRecord}`;
    const res = await fetch(url, { headers: ultimateHeaders(), cache: "no-store" });
    if (!res.ok) throw new Error(`Ultimate NOR search failed: ${res.status} ${res.statusText}`);
    const raw = await res.text();

    // hvis den faktisk gir rader, returner
    const rows = parseUltimateResults(raw);
    if (rows.length > 0) return raw;
  }

  // 2) fallback: mange bruker search_startrecord
  {
    const url = `${base}&search_startrecord=${startRecord}`;
    const res = await fetch(url, { headers: ultimateHeaders(), cache: "no-store" });
    if (!res.ok) throw new Error(`Ultimate NOR search failed: ${res.status} ${res.statusText}`);
    return res.text();
  }
}

export async function fetchUltimateNorSearchAllRaw(
  eventId: number,
  distance: number | null = null,
  language = "us",
  pageSize = 1000,
  maxPages = 200
) {
  const pages: string[] = [];
  let prevSig: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const startRecord = page * pageSize;

    const raw = await fetchUltimateNorSearchRaw(eventId, distance, language, startRecord);
    const rows = parseUltimateResults(raw);

    if (rows.length === 0) break;

    const first = rows[0];
    const last = rows[rows.length - 1];
    const sig =
      `${first?.bib ?? ""}|${first?.name ?? ""}|${first?.timeStr ?? ""}` +
      `__${last?.bib ?? ""}|${last?.name ?? ""}|${last?.timeStr ?? ""}`;

    if (prevSig && sig === prevSig) break;
    prevSig = sig;

    pages.push(raw);

    if (rows.length < pageSize) break;
  }

  return pages;
}
