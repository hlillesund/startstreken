function unescapeJsString(s: string) {
  // payloaden inneholder \" og \r\n og \'
  return s
    .replace(/\\r\\n/g, "\n")
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function stripTags(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
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
  // Finn HTML-strengen som settes inn i list_results
  const m = raw.match(/document\.getElementById\('list_results'\)\.innerHTML='([\s\S]*?)';\s*/);
  if (!m) return [];

  const htmlEscaped = m[1];
  const html = unescapeJsString(htmlEscaped);

  // Finn alle <tr ...>...</tr>
  const trs = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  const rows: UltimateRow[] = [];

  for (const tr of trs) {
    // hopp over header
    if (tr.includes("result_hdr")) continue;

    const tds = tr.match(/<td[\s\S]*?<\/td>/gi) ?? [];
    // Forventet kolonner:
    // 0 Rank, 1 Race No, 2 Name, 3 Nation, 4 Club, 5 Category, 6 Time, 7 Behind, 8 ...
    if (tds.length < 7) continue;

    const get = (i: number) => stripTags(tds[i] ?? "");

    const rankStr = get(0);
    const bibStr = get(1);
    const nameStr = get(2);
    const nationStr = get(3);
    const clubStr = get(4);
    const catStr = get(5);
    const timeStr = get(6);

    const rank = rankStr ? Number(rankStr) : null;

    rows.push({
      rank: Number.isFinite(rank as any) ? (rank as number) : null,
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