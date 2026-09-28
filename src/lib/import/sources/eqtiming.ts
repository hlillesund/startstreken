import { normalizeGender } from "@/lib/infer-gender";
import { fetchJson, fetchText } from "../http";
import { parseDistanceFromText } from "../distance";
import { eqRelevance } from "../relevance";
import { cleanStr, normKey, parseCsv, parseTimeMs, syntheticPersonId } from "../text";
import type { DiscoveredEvent, NormalizedEvent, NormalizedRace, NormalizedResult } from "../types";

const BASE = "https://live.eqtiming.com";
/** EQ's generic "all results" CSV report. */
const RESULT_REPORT_ID = 347;
const STARTLIST_PAGE = 1000;

/** Sports (Gren) whose races should never be ranked as road distances. */
const NON_ROAD_SPORTS = new Set([
  442, // Terrengløp
  437, // Fjell-løp
  440, // Motbakkeløp
  439, // Hinderløp
  446, // Ultraløp
  443, // Trappeløp
  441, // Stafett
  461, // Backyard
  444, // Trugeløp
]);

function headers(eventId: string | number) {
  return {
    "X-Requested-With": "XMLHttpRequest",
    EQLiveLocale: "nb-NO",
    Referer: `${BASE}/${eventId}`,
  };
}

export function eqEventUrl(id: string | number) {
  return `${BASE}/${id}`;
}

/* ── Discovery ──────────────────────────────────────────────────────────── */

type EqSport = { Id: number; Name: string; Parent: EqSport | null };
type EqListEvent = {
  Id: number;
  Name: string;
  Starttime: string;
  Date?: string;
  Published?: boolean;
  Sport?: EqSport | null;
  City?: { Name?: string; Country?: { Iso2?: string } } | null;
  Organization?: { Country?: { Iso2?: string } } | null;
  Organizer?: { Name?: string } | null;
  Meta?: { GotContestants?: boolean; GotResults?: boolean } | null;
  Race?: Record<string, { Distance?: number }> | null;
};

function sportChain(s: EqSport | null | undefined): EqSport[] {
  const out: EqSport[] = [];
  for (let x = s; x; x = x.Parent) if (x.Id) out.push(x);
  return out;
}

export async function discoverEq(from: string, to: string): Promise<DiscoveredEvent[]> {
  const url =
    `${BASE}/api/Events?dateFrom=${from}&dateTo=${to}&take=5000` +
    `&dateSort=true&desc=true&onlyValidated=false`;
  const list = await fetchJson<EqListEvent[]>(url, { headers: headers(0), timeoutMs: 90_000 });

  const out: DiscoveredEvent[] = [];
  for (const e of Array.isArray(list) ? list : []) {
    if (e.Published === false) continue;
    const chain = sportChain(e.Sport);
    const country = e.City?.Country?.Iso2 ?? e.Organization?.Country?.Iso2 ?? null;
    const relevance = eqRelevance({
      name: e.Name ?? "",
      country,
      sportIds: chain.map((s) => s.Id),
      organizer: e.Organizer?.Name ?? null,
    });
    if (relevance === "irrelevant") continue;

    const distances = Object.values(e.Race ?? {})
      .map((r) => r?.Distance ?? 0)
      .filter((d) => d > 0);

    out.push({
      source: "eqtiming",
      sourceEventId: String(e.Id),
      name: (e.Name ?? "").trim(),
      date: (e.Date ?? e.Starttime ?? "").slice(0, 10) || null,
      location: e.City?.Name?.trim() || null,
      country,
      sport: chain.map((s) => s.Name).join(" › ") || null,
      relevance,
      hasResults: e.Meta?.GotResults ?? null,
      meta: { organizer: e.Organizer?.Name ?? null, distances, sportId: chain[0]?.Id ?? null },
    });
  }
  return out;
}

/* ── Event import ───────────────────────────────────────────────────────── */

type EqEventInfo = {
  Navn?: string;
  Dato?: string;
  Sted?: string;
  Land?: { ISO2?: string };
  Gren?: { UID?: number; Navn?: string };
  Etapper?: Record<string, { UID: number; Navn?: string; Km?: number; Seksjon?: boolean }>;
};

type StartlistEntry = {
  uid: string;
  name: string | null;
  gender: "M" | "F" | null;
  birthYear: number | null;
  club: string | null;
  className: string | null;
};

type EqStartlistItem = {
  Startnummer?: number | string | null;
  FullStartnummer?: number | string | null;
  Klubbnavn?: string | null;
  KlubbTeamFormatert?: string | null;
  Klasse?: { Navn?: string; Kjonn?: string } | null;
  Utover?: {
    UID?: number | string;
    NavnFormatert?: string;
    Fornavn?: string;
    Etternavn?: string;
    Kjonn?: string;
    Aar?: number;
    Klubbnavn?: string;
  } | null;
};

async function fetchStartlist(eventId: string): Promise<Map<string, StartlistEntry>> {
  const byBib = new Map<string, StartlistEntry>();
  for (let startAt = 1, page = 0; page < 100; page++, startAt += STARTLIST_PAGE) {
    const url = `${BASE}/api/Startlist/${eventId}/0?startAt=${startAt}&query=&filter=&sortcols=&count=${STARTLIST_PAGE}`;
    const data = await fetchJson<{ Items?: Record<string, EqStartlistItem> | EqStartlistItem[] }>(url, {
      headers: headers(eventId),
    });
    const items = Array.isArray(data?.Items) ? data.Items : Object.values(data?.Items ?? {});
    for (const p of items) {
      const bib = cleanStr(p.Startnummer ?? p.FullStartnummer);
      const uid = cleanStr(p.Utover?.UID);
      if (!bib || !uid || uid === "0" || byBib.has(bib)) continue;
      const u = p.Utover ?? {};
      // Separate first/last names are reliable; NavnFormatert is sometimes "Surname First".
      const name = cleanStr(`${u.Fornavn ?? ""} ${u.Etternavn ?? ""}`) ?? cleanStr(u.NavnFormatert);
      const year = Number(u.Aar);
      byBib.set(bib, {
        uid,
        name,
        gender: normalizeGender(u.Kjonn) ?? normalizeGender(p.Klasse?.Kjonn),
        birthYear: Number.isInteger(year) && year > 1900 && year < 2100 ? year : null,
        club: cleanStr(p.Klubbnavn) ?? cleanStr(u.Klubbnavn),
        className: cleanStr(p.Klasse?.Navn),
      });
    }
    if (items.length < STARTLIST_PAGE) break;
  }
  return byBib;
}

export async function fetchEqEvent(eventId: string): Promise<NormalizedEvent> {
  const warnings: string[] = [];

  const info = await fetchJson<EqEventInfo>(`${BASE}/api/Event/${eventId}`, { headers: headers(eventId) }).catch(
    (e) => {
      warnings.push(`Fant ikke eventinfo: ${String(e?.message ?? e)}`);
      return {} as EqEventInfo;
    }
  );

  const [startlist, csv] = await Promise.all([
    fetchStartlist(eventId).catch((e) => {
      warnings.push(`Startliste feilet (${String(e?.message ?? e)}) — bruker navn fra resultatlisten`);
      return new Map<string, StartlistEntry>();
    }),
    fetchText(`${BASE}/api//Report/${RESULT_REPORT_ID}?eventId=${eventId}`, {
      headers: { ...headers(eventId), Accept: "text/csv,*/*" },
      timeoutMs: 90_000,
    }),
  ]);

  const nonRoad = info.Gren?.UID ? NON_ROAD_SPORTS.has(info.Gren.UID) : false;
  const stageKm = new Map<string, number>();
  // Sections are laps/splits of another race (e.g. "Runde 1", "Runde 2"), not races.
  const sections = new Set<string>();
  for (const st of Object.values(info.Etapper ?? {})) {
    if (!st?.Navn) continue;
    if (st.Seksjon) sections.add(normKey(st.Navn));
    else if (st.Km && st.Km > 0) stageKm.set(normKey(st.Navn), Math.round(st.Km * 1000));
  }

  const rows = parseCsv(csv, ";");
  const races = new Map<string, NormalizedRace>();
  let skipped = 0;
  let skippedSections = 0;
  let inconsistent = 0;
  let viaStartlist = 0;

  if (rows.length >= 2) {
    const header = rows[0].map((h) => normKey(h));
    const col = (...names: string[]) => header.findIndex((h) => names.some((n) => h === n || h.includes(n)));
    const iBib = col("startnumber", "startnummer", "bib");
    const iFirst = col("firstname", "fornavn");
    const iLast = col("surname", "lastname", "etternavn");
    const iName = header.findIndex((h) => h === "name" || h === "navn");
    const iGender = col("gender", "kjønn");
    const iNat = header.findIndex((h) => h === "nat" || h === "nation");
    const iClub = col("club", "klubb");
    const iRace = header.findIndex((h) => h === "race" || h === "etappe" || h === "løp");
    const iClass = header.findIndex((h) => h === "class" || h === "klasse");
    const iTime = col("total time", "totaltid", "sluttid");
    const iDiff = col("diff winner", "diff");
    const iRank = header.findIndex((h) => h === "rank" || h === "plass");

    if (iRace === -1 || iTime === -1) {
      throw new Error(`EQ-rapport ${RESULT_REPORT_ID} mangler Race/Total Time-kolonner (header: ${header.join(", ")})`);
    }

    // Each row's gap is relative to its class winner. A time that doesn't equal
    // "winner + gap" is a timing glitch (e.g. a lapped runner stopped a lap early).
    const gapMs = (v: string | null) => (v && /^0+(:0+)*([.,]0+)?$/.test(v) ? 0 : parseTimeMs(v));
    const winnerTime = new Map<string, number>();
    if (iDiff >= 0) {
      for (const r of rows.slice(1)) {
        const t = parseTimeMs(cleanStr(r[iTime]));
        if (t && gapMs(cleanStr(r[iDiff])) === 0) {
          const k = `${normKey(r[iRace] ?? "")}|${normKey(r[iClass] ?? "")}`;
          winnerTime.set(k, Math.min(winnerTime.get(k) ?? Infinity, t));
        }
      }
    }
    for (const r of rows.slice(1)) {
      const get = (i: number) => (i >= 0 ? cleanStr(r[i]) : null);
      const raceName = get(iRace);
      const timeMs = parseTimeMs(get(iTime));
      // Rows without a gap to the winner are unranked (no timing, wrong course, DSQ…).
      if (!raceName || !timeMs || (iDiff >= 0 && !get(iDiff))) {
        skipped++;
        continue;
      }
      const gap = iDiff >= 0 ? gapMs(get(iDiff)) : null;
      const winner = winnerTime.get(`${normKey(raceName)}|${normKey(get(iClass) ?? "")}`);
      if (gap !== null && winner !== undefined && Math.abs(timeMs - (winner + gap)) > Math.max(5_000, 0.02 * timeMs)) {
        inconsistent++;
        skipped++;
        continue;
      }

      if (sections.has(normKey(raceName))) {
        skippedSections++;
        continue;
      }

      const bib = get(iBib);
      const entry = bib ? startlist.get(bib) : undefined;
      const csvName = cleanStr(`${get(iFirst) ?? ""} ${get(iLast) ?? ""}`) ?? get(iName);
      const name = (iFirst >= 0 && iLast >= 0 ? csvName : null) ?? entry?.name ?? csvName;
      if (!name) {
        skipped++;
        continue;
      }
      if (entry) viaStartlist++;
      const club = get(iClub) ?? entry?.club ?? null;
      const className = get(iClass) ?? entry?.className ?? null;

      const key = normKey(raceName);
      let race = races.get(key);
      if (!race) {
        // EQ's km value is sometimes wrong ("5000 meter" listed as 65 km); trust an
        // explicit distance in the race name when the two clearly disagree.
        const km = stageKm.get(key) ?? null;
        const fromName = parseDistanceFromText(raceName);
        const distanceM = km && fromName && Math.abs(km - fromName) / fromName > 0.25 ? fromName : (km ?? fromName);
        if (distanceM !== km && km) warnings.push(`${raceName}: EQ oppgir ${km / 1000} km — bruker ${distanceM} m fra navnet`);
        race = { sourceRaceId: key, name: raceName, distanceM, nonRoad, results: [] };
        races.set(key, race);
      }

      const result: NormalizedResult = {
        personKey: entry?.uid ?? syntheticPersonId(name, club),
        name,
        gender: normalizeGender(get(iGender)) ?? entry?.gender ?? null,
        birthYear: entry?.birthYear ?? null,
        club,
        nation: get(iNat),
        bib,
        className,
        timeMs,
        sourceRank: Number(get(iRank)) || null,
        raw: { source: "eqtiming", eventId: Number(eventId), reportId: RESULT_REPORT_ID, raceName, className },
      };
      race.results.push(result);
    }
  }

  if (rows.length < 2) warnings.push("Resultatrapporten er tom (ingen resultater publisert ennå?)");
  if (inconsistent) {
    warnings.push(`${inconsistent} resultat(er) hoppet over: tiden stemmer ikke med avstanden til vinneren (tidtakingsfeil)`);
  }
  if (skippedSections) {
    warnings.push(`${skippedSections} mellomtider/runder (${[...sections].join(", ")}) ble hoppet over — de er ikke egne løp`);
  }

  return {
    source: "eqtiming",
    sourceEventId: eventId,
    name: cleanStr(info.Navn),
    date: info.Dato ? info.Dato.slice(0, 10) : null,
    location: cleanStr(info.Sted),
    url: eqEventUrl(eventId),
    races: [...races.values()],
    notRaces: [...sections],
    warnings,
    stats: { csvRows: Math.max(0, rows.length - 1), skipped, skippedSections, startlist: startlist.size, viaStartlist },
  };
}
