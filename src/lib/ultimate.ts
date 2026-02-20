import { parseUltimateResults } from "@/lib/ultimate-parse";

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