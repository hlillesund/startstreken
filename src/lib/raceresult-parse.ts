// src/lib/raceresult-parse.ts

export type RaceResultRow = {
  rank: number | null;
  bib: string | null;
  name: string | null;
  nation: string | null;
  club: string | null;
  category: string | null;
  timeStr: string | null;
};

function clean(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function parseRank(rankStr: string | null): number | null {
  if (!rankStr) return null;
  const n = Number(rankStr.replace(".", "").trim());
  return Number.isFinite(n) ? n : null;
}

function parseNationFlagCell(cell: string | null): string | null {
  // "[img:/graphics/flags/NO.svg]" -> "NO"
  if (!cell) return null;
  const m = cell.match(/flags\/([A-Za-z]{2})\.svg/i);
  return m ? m[1].toUpperCase() : null;
}

/**
 * RaceResult RRPublish "list" kan komme i flere formater.
 *
 * I ditt tilfelle:
 * {
 *   list: {...},
 *   DataFields: [...],
 *   data: { "#2_10 km": { "#4_": [ [row], [row] ] } }
 * }
 *
 * Denne parseren:
 * - støtter data som Array (klassisk)
 * - støtter data som Object med grupper (rekursiv flatten)
 * - støtter fields/DataFields når data er Array (for mer generisk mapping)
 */
export function parseRaceResultList(raw: string): RaceResultRow[] {
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    return [];
  }

  // ---------- 1) Finn alle row-arrays (flat) ----------
  const rowArrays: any[][] = [];

  const pushRowsFromNode = (node: any) => {
    if (!node) return;

    if (Array.isArray(node)) {
      // node kan være:
      // - [ "221","968","1.", ... ]            (enkelt-row)
      // - [ [row], [row], ... ]                (liste av rows)
      if (node.length === 0) return;

      if (Array.isArray(node[0])) {
        for (const r of node) {
          if (Array.isArray(r)) rowArrays.push(r);
        }
      } else {
        rowArrays.push(node);
      }
      return;
    }

    if (typeof node === "object") {
      for (const k of Object.keys(node)) pushRowsFromNode(node[k]);
    }
  };

  // RaceResult: data kan være array eller object (gruppert)
  pushRowsFromNode(json?.data);

  if (rowArrays.length === 0) return [];

  // ---------- 2) Hvis vi har fields/DataFields og data var "flat array", kan vi mappe mer generisk ----------
  // Men når data er gruppert (object), har vi allerede flat rowArrays og bruker "observed layout"
  const fieldsRaw =
    (Array.isArray(json?.fields) && json.fields) ||
    (Array.isArray(json?.DataFields) && json.DataFields) ||
    (Array.isArray(json?.list?.fields) && json.list.fields) ||
    (Array.isArray(json?.list?.DataFields) && json.list.DataFields) ||
    null;

  // Sjekk om original json.data var flat array av rows
  const originalDataIsFlatArray =
    Array.isArray(json?.data) && json.data.length && Array.isArray(json.data[0]);

  if (fieldsRaw && originalDataIsFlatArray) {
    const fields: string[] = fieldsRaw.map((x: any) => String(x));
    const lower = fields.map((f) => f.toLowerCase());

    const idx = (names: string[]) => {
      for (const n of names) {
        const i = lower.indexOf(n.toLowerCase());
        if (i !== -1) return i;
      }
      return -1;
    };

    const iRank = idx(["rank", "place", "pos", "position", "plass", "pl."]);
    const iBib = idx(["no", "bib", "startno", "startnr", "startnummer"]);
    const iName = idx(["displayname", "name", "full name", "fullname", "athlete", "runner", "navn"]);
    const iNat = idx(["nation.flag", "nation", "country", "land"]);
    const iClub = idx(["club", "team", "klubb", "lag"]);
    const iCat = idx(["agegroup.name", "class", "category", "klasse", "klass"]);
    const iTime = idx([
      "finish.chip",
      "time",
      "result",
      "finish",
      "netto",
      "net time",
      "chip",
      "chip time",
      "chiptime",
      "brutto",
      "bruttotid",
      "gross",
      "gross time",
    ]);

    const get = (arr: any[], i: number) => (i < 0 ? null : clean(arr[i]));

    return rowArrays.map((arr) => {
      const natCell = get(arr, iNat);
      const nation = natCell?.startsWith("[img:") ? parseNationFlagCell(natCell) : natCell;

      return {
        rank: parseRank(get(arr, iRank)),
        bib: get(arr, iBib),
        name: get(arr, iName),
        nation,
        club: get(arr, iClub),
        category: get(arr, iCat),
        timeStr: get(arr, iTime),
      };
    });
  }

  // ---------- 3) Fallback: "observed layout" (sikkert for ditt event) ----------
  // Layout (bekreftet):
  // 0: internal row id
  // 1: bib
  // 2: rank "8."
  // 3: name "Lastname, Firstname"
  // 4: flag cell "[img:/graphics/flags/NO.svg]"
  // 5: YEAR (ofte tom/kan være år)
  // 6: CLUB (ofte tom i ditt utdrag)
  // 7: time "54:32"
  // 8: gap "+5:02" / "--"
  return rowArrays.map((arr) => {
    const bib = clean(arr[1]);
    const rankStr = clean(arr[2]);
    const name = clean(arr[3]);
    const natCell = clean(arr[4]);
    const club = clean(arr[6]); // kan være tom, men plukk den hvis den finnes
    const timeStr = clean(arr[7]);

    return {
      rank: parseRank(rankStr),
      bib,
      name,
      nation: parseNationFlagCell(natCell),
      club,
      category: null,
      timeStr,
    };
  });
}

/**
 * Samme mønster som Ultimate: parse alle pages og dedupe.
 * Litt bedre nøkkel: bib + name + time + club
 */
export function parseRaceResultListFromPages(pages: string[]) {
  const out: RaceResultRow[] = [];
  const seen = new Set<string>();

  for (const raw of pages) {
    const rows = parseRaceResultList(raw);
    for (const r of rows) {
      const key = `${r.bib ?? ""}|${r.name ?? ""}|${r.timeStr ?? ""}|${r.club ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
  }

  return out;
}