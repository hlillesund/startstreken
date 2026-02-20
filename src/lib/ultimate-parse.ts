import { decode } from "html-entities";

function unescapeJsString(s: string) {
  // payloaden inneholder \" og \r\n og \'
  return s
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

/**
 * Dekoder HTML entities: &oslash; &#248; &#xF8; &eacute; osv.
 * decode() håndterer også masse varianter som vi ikke vil hardcode.
 */
function decodeHtmlEntities(s: string) {
  if (!s) return s;
  return decode(s);
}

function stripTags(html: string) {
  const text = html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[^>]+>/g, "")
    .trim();

  // decode entities etter at tags er fjernet
  return decodeHtmlEntities(text)
    .replace(/\s+/g, " ")
    .trim();
}

export type UltimateRow = {
  rank: number | null;
  bib: string | null;
  name: string | null;
  nation: string | null;
  club: string | null;
  category: string | null;
  timeStr: string | null;
};

export function parseUltimateResults(raw: string): UltimateRow[] {
  // Støtter både single/double quotes
  const m =
    raw.match(/document\.getElementById\('list_results'\)\.innerHTML='([\s\S]*?)';/m) ||
    raw.match(/document\.getElementById\("list_results"\)\.innerHTML="([\s\S]*?)";/m);

  if (!m) return [];

  const htmlEscaped = m[1];
  const html = unescapeJsString(htmlEscaped);

  const trs = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  const rows: UltimateRow[] = [];

  for (const tr of trs) {
    if (tr.includes("result_hdr")) continue;

    const tds = tr.match(/<td[\s\S]*?<\/td>/gi) ?? [];
    if (tds.length < 7) continue;

    const get = (i: number) => stripTags(tds[i] ?? "");

    const rankStr = get(0);
    const bibStr = get(1);
    const nameStr = get(2);
    const nationStr = get(3);
    const clubStr = get(4);
    const catStr = get(5);
    const timeStr = get(6);

    const rankNum = rankStr ? Number(rankStr) : NaN;

    rows.push({
      rank: Number.isFinite(rankNum) ? rankNum : null,
      bib: bibStr || null,
      name: nameStr || null,
      nation: nationStr || null,
      club: clubStr || null,
      category: catStr || null,
      timeStr: timeStr || null,
    });
  }

  return rows;
}

/**
 * Parser alle pages og deduper.
 * Litt bedre nøkkel: bib + name + time + club (club hjelper når bib mangler/gjenbrukes)
 */
export function parseUltimateResultsFromPages(pages: string[]) {
  const out: UltimateRow[] = [];
  const seen = new Set<string>();

  for (const raw of pages) {
    const rows = parseUltimateResults(raw);
    for (const r of rows) {
      const key = `${r.bib ?? ""}|${r.name ?? ""}|${r.timeStr ?? ""}|${r.club ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
  }

  return out;
}