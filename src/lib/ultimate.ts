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

/**
 * ✅ Advanced search: kun norske (NOR), valgfritt distansefilter.
 */
export async function fetchUltimateNorSearchRaw(
  eventId: number,
  distance: number | null = null,
  language = "us",
  startRecord = 0
) {
  const url =
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
    `&search_sortby=[TIMEFIELD]` +
    `&search_sorttype=ASC` +
    `&results_startrecord=${startRecord}`;

  const res = await fetch(url, { headers: { Accept: "*/*" }, cache: "no-store" });
  if (!res.ok) throw new Error(`Ultimate NOR search failed: ${res.status} ${res.statusText}`);
  return res.text();
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

/**
 * Hvis advanced-search ikke pager med results_startrecord:
 * - prøv:
 *    &search_startrecord=${startRecord}
 *   eller:
 *    &start=${startRecord}
 * Sjekk network i devtools hos Ultimate.
 */