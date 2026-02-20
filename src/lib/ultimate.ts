import { parseUltimateResults } from "@/lib/ultimate-parse";

/**
 * Standard results-feed (som du har nå)
 */
export async function fetchUltimateResultsRaw(
  eventId: number,
  distance: number,
  language = "us",
  startRecord = 0
) {
  const url =
    `https://live.ultimate.dk/desktop/front/data.php?` +
    `eventid=${eventId}&mode=results&distance=${distance}&category=&language=${language}` +
    `&results_startrecord=${startRecord}`;

  const res = await fetch(url, { headers: { Accept: "*/*" }, cache: "no-store" });
  if (!res.ok) throw new Error(`Ultimate failed: ${res.status} ${res.statusText}`);

  return res.text();
}

export async function fetchUltimateResultsAllRaw(
  eventId: number,
  distance: number,
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
    const sig = `${first?.bib ?? ""}|${first?.name ?? ""}|${first?.timeStr ?? ""}__${last?.bib ?? ""}|${last?.name ?? ""}|${last?.timeStr ?? ""}`;

    // hvis vi får samme side igjen => paging har stoppet / ingen flere rader
    if (prevSig && sig === prevSig) break;
    prevSig = sig;

    pages.push(raw);

    // ofte siste side, men sig-checken er hovedstopper uansett
    if (rows.length < pageSize) break;
  }

  return pages;
}

/**
 * ✅ Advanced search: kun norske (NOR), valgfritt distansefilter.
 *
 * NOTE:
 * - Ultimate advanced search bruker ofte samme "list_results" innerHTML som parseUltimateResults forventer.
 * - Paginering: mange events støtter results_startrecord også i search-mode.
 *   Hvis ditt event krever noe annet, bytt parameternavn her (se kommentar under).
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
    const sig = `${first?.bib ?? ""}|${first?.name ?? ""}|${first?.timeStr ?? ""}__${last?.bib ?? ""}|${last?.name ?? ""}|${last?.timeStr ?? ""}`;

    if (prevSig && sig === prevSig) break;
    prevSig = sig;

    pages.push(raw);

    if (rows.length < pageSize) break;
  }

  return pages;
}

/**
 * Hvis du oppdager at advanced-search ikke pager med results_startrecord:
 * - prøv å bytte siste querystring fra:
 *    &results_startrecord=${startRecord}
 *   til:
 *    &search_startrecord=${startRecord}
 *   eller:
 *    &start=${startRecord}
 *
 * Du finner riktig param ved å åpne devtools network på Ultimate og se hva den kaller.
 */