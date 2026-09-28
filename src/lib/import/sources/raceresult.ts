import { inferGender, inferGenderFromCategory, normalizeGender } from "@/lib/infer-gender";
import { isParaClass, parseDistanceFromText } from "../distance";
import { fetchJson } from "../http";
import { nameRelevance } from "../relevance";
import { cleanStr, normKey, parseTimeMs, prettyName, syntheticPersonId } from "../text";
import type { DiscoveredEvent, NormalizedEvent, NormalizedRace, NormalizedResult } from "../types";

const PORTAL = "https://my.raceresult.com";
const NORWAY_ISO_NUMERIC = 578;
const RUNNING_EVENT_TYPE = 0;

export function raceResultEventUrl(id: string | number) {
  return `${PORTAL}/${id}/results`;
}

/* ── Discovery ──────────────────────────────────────────────────────────── */

type RREvent = {
  id: number;
  eventType?: number;
  eventTypeName?: string;
  name: string;
  dateFrom?: string;
  location?: string;
  countryCode?: string;
  distances?: string;
};

type RRListGroup = { Mode?: string; HasMore?: boolean; Events?: RREvent[] };

function toDiscovered(e: RREvent): DiscoveredEvent {
  const country = e.countryCode ?? null;
  return {
    source: "raceresult",
    sourceEventId: String(e.id),
    name: (e.name ?? "").trim(),
    date: e.dateFrom ?? null,
    location: e.location?.trim() || null,
    country,
    sport: e.eventTypeName ?? null,
    relevance: e.eventType === RUNNING_EVENT_TYPE ? nameRelevance(e.name ?? "", country) : "maybe",
    hasResults: null,
    meta: { distances: e.distances || null },
  };
}

export async function discoverRaceResult(from: string, to: string): Promise<DiscoveredEvent[]> {
  const url =
    `${PORTAL}/RREvents/list?country=${NORWAY_ISO_NUMERIC}&type=${RUNNING_EVENT_TYPE}` +
    `&dateFrom=${from}&dateTo=${to}&modes=last&limit=2000&lang=en`;
  const groups = await fetchJson<RRListGroup[] | null>(url);
  const out: DiscoveredEvent[] = [];
  for (const g of groups ?? []) for (const e of g.Events ?? []) out.push(toDiscovered(e));
  return out.filter((e) => e.relevance !== "irrelevant");
}

async function lookupEvent(eventId: string): Promise<RREvent | null> {
  const groups = await fetchJson<RRListGroup[] | null>(`${PORTAL}/RREvents/list?ids=${eventId}&modes=&lang=en`).catch(
    () => null
  );
  return groups?.[0]?.Events?.[0] ?? null;
}

/* ── Config / list selection ────────────────────────────────────────────── */

type RRList = { Name: string; Contest?: string | number; Live?: number; ShowAs?: string };
type RRConfig = {
  key: string;
  eventname?: string;
  server?: string;
  contests?: Record<string, string>;
  lists?: RRList[];
  TabConfig?: { Lists?: RRList[] };
  Tab?: { Config?: { Lists?: RRList[] } };
};

const SKIP_LIST =
  /(start|deltaker|participant|påmeld|entr(y|ies)|\blag\b|team|stafett|relay|klubb|club|premie|prize|diplom|certificate|split|mellomtid|statist|sms|speaker|live\s*track)/i;
const SKIP_CONTEST = /(test|trukket|ikke betalt|uten tid|not timed|untimed|dummy|frivillig|volunteer|stafett|relay)/i;

function listScore(l: RRList): number {
  const label = `${l.Name} ${l.ShowAs ?? ""}`.toLowerCase();
  let s = 0;
  if (/overall|total|samlet|\ball\b/.test(label)) s += 5;
  if (/result/.test(label)) s += 3;
  if (/final/.test(label)) s += 2;
  if (/gender|kjønn|klasse|class|age|alder/.test(label)) s -= 1;
  if (l.Live) s -= 2;
  return s;
}

/** Picks one list per contest ("0" = one list that covers every contest). */
function chooseLists(cfg: RRConfig): { list: RRList; contest: string }[] {
  const all = cfg.lists ?? cfg.TabConfig?.Lists ?? cfg.Tab?.Config?.Lists ?? [];
  const usable = all.filter((l) => l?.Name && !SKIP_LIST.test(`${l.Name} ${l.ShowAs ?? ""}`));
  const candidates = usable.length ? usable : all;
  if (!candidates.length) return [];

  const best = (ls: RRList[]) => [...ls].sort((a, b) => listScore(b) - listScore(a))[0];
  const global = candidates.filter((l) => String(l.Contest ?? "0") === "0");
  if (global.length) return [{ list: best(global), contest: "0" }];

  const byContest = new Map<string, RRList[]>();
  for (const l of candidates) {
    const c = String(l.Contest);
    byContest.set(c, [...(byContest.get(c) ?? []), l]);
  }
  return [...byContest.entries()].map(([contest, ls]) => ({ list: best(ls), contest }));
}

/** Human label for a list: ShowAs ("{EN:Overall|NB:Totalt}" → "Totalt") or the part after "|". */
function listLabel(l: RRList): string {
  const showAs = l.ShowAs ?? "";
  const nb = showAs.match(/NB:([^|}]+)/)?.[1] ?? (showAs.startsWith("{") ? "" : showAs);
  return nb.trim() || l.Name.split("|").pop()?.replace(/^[\d\s-]+/, "").trim() || "Alle distanser";
}

/* ── Row parsing ────────────────────────────────────────────────────────── */

type FieldMap = {
  bib: number;
  name: number;
  first: number;
  last: number;
  gender: number;
  year: number;
  club: number;
  nation: number;
  ageGroup: number;
  rank: number;
  time: number;
};

function findField(fields: string[], test: (f: string) => boolean, skip: Set<number> = new Set()): number {
  return fields.findIndex((f, i) => !skip.has(i) && test(f));
}

function mapFields(dataFields: string[], rows: string[][]): FieldMap {
  const f = dataFields.map((x) => String(x).toLowerCase());
  const bib = findField(f, (x) => x === "bib" || /^bib\b/.test(x) || x === "startnr");
  const name = findField(f, (x) => /displayname|lfname|flname|fullname|nameorteam|^\[?name\]?$/.test(x));
  const first = findField(f, (x) => /^firstname$|^\[firstname\]$/.test(x));
  const last = findField(f, (x) => /^lastname$|^\[lastname\]$/.test(x));
  const gender = findField(f, (x) => /^gender|^\[gender|^sex\b/.test(x));
  const year = findField(f, (x) => /^year$|yearofbirth|birthyear|^yob$|^\[year\]$/.test(x));
  const club = findField(f, (x) => /^club$|^\[club\]$|^team$|^klubb/.test(x));
  const nation = findField(f, (x) => /nation\.ioc|nation\.code|^nation$/.test(x));
  const nationFlag = nation === -1 ? findField(f, (x) => /nation\.flag|^country/.test(x)) : nation;
  const ageGroup = findField(f, (x) => /agegroup/.test(x) && !/rank/.test(x));
  const rank = findField(f, (x) => /rank/.test(x) && !/agegroup|gender|class/.test(x));

  const known = new Set([bib, name, first, last, gender, year, club, nationFlag, ageGroup, rank].filter((i) => i >= 0));
  const excluded = (x: string) => /gap|pace|speed|rank|\btod\b|timeofday|behind|diff|min\/km|switch\(|^c\(/.test(x);
  const named = f
    .map((x, i) => ({ x, i }))
    .filter(({ x, i }) => !known.has(i) && !excluded(x) && /finish|time|chip|gun|netto|brutto|result|\[tp|tpfinish/.test(x))
    .map(({ i }) => i);
  const others = f.map((_, i) => i).filter((i) => !known.has(i) && !excluded(f[i]) && !named.includes(i));

  // Among candidate columns, the finishing time is the one that parses most often
  // and — to tell it apart from pace columns — has the larger typical value.
  const score = (i: number) => {
    const times = rows.map((r) => parseTimeMs(r[i])).filter((t): t is number => t !== null).sort((a, b) => a - b);
    return { count: times.length, median: times[Math.floor(times.length / 2)] ?? 0 };
  };
  const pick = (cols: number[]) => {
    let best = -1;
    let bestScore = { count: 0, median: 0 };
    for (const i of cols) {
      const s = score(i);
      if (s.count > bestScore.count || (s.count === bestScore.count && s.median > bestScore.median)) {
        best = i;
        bestScore = s;
      }
    }
    return bestScore.count > 0 ? best : -1;
  };
  const chip = pick(named.filter((i) => /chip|netto|net\b/.test(f[i])));
  const anyNamed = chip >= 0 ? chip : pick(named);
  const time = anyNamed >= 0 ? anyNamed : pick(others);

  return { bib, name, first, last, gender, year, club, nation: nationFlag, ageGroup, rank, time };
}

type Leaf = { path: string[]; rows: string[][] };

function collectLeaves(node: unknown, path: string[], out: Leaf[]) {
  if (Array.isArray(node)) {
    if (node.length && Array.isArray(node[0])) out.push({ path, rows: node as string[][] });
    else if (node.length && typeof node[0] !== "object") out.push({ path, rows: [node as string[]] });
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) collectLeaves(v, [...path, k.replace(/^#\d+_/, "").trim()], out);
  }
}

function flagToIoc(v: string | null): string | null {
  if (!v) return null;
  const m = v.match(/flags\/([A-Za-z]{2,3})\.(svg|png)/i);
  if (m) return m[1].toUpperCase();
  return v.startsWith("[img:") ? null : v;
}

/* ── Event import ───────────────────────────────────────────────────────── */

export async function fetchRaceResultEvent(eventId: string): Promise<NormalizedEvent> {
  const warnings: string[] = [];
  const [cfg, meta] = await Promise.all([
    fetchJson<RRConfig>(`${PORTAL}/${eventId}/results/config?page=results&noVisitor=1`),
    lookupEvent(eventId),
  ]);
  if (!cfg?.key) throw new Error("RaceResult: fant ikke resultatkonfigurasjon (ingen publiserte resultater?)");

  const server = cfg.server ? `https://${cfg.server}` : PORTAL;
  const contests = Object.entries(cfg.contests ?? {}).filter(([id]) => id !== "0");
  const contestByNorm = new Map(contests.map(([id, name]) => [normKey(name), { id, name }]));
  const selections = chooseLists(cfg);
  if (!selections.length) warnings.push("Ingen resultatlister publisert");

  const races = new Map<string, NormalizedRace>();
  let skipped = 0;
  let parsed = 0;

  for (const { list, contest } of selections) {
    const params = new URLSearchParams({
      key: cfg.key,
      listname: list.Name,
      page: "results",
      contest,
      r: "all",
      l: "0",
    });
    const data = await fetchJson<{ DataFields?: string[]; data?: unknown; error?: string }>(
      `${server}/${eventId}/results/list?${params}`,
      { timeoutMs: 90_000 }
    );
    if (data?.error) {
      warnings.push(`Liste «${list.Name}» (contest ${contest}): ${data.error}`);
      continue;
    }

    const leaves: Leaf[] = [];
    collectLeaves(data?.data, [], leaves);
    const allRows = leaves.flatMap((l) => l.rows);
    const fields = data?.DataFields ?? [];
    const fm = mapFields(fields, allRows);
    if (fm.name < 0 && (fm.first < 0 || fm.last < 0)) {
      const why = fields.some((x) => /anonym/i.test(x))
        ? "listen har anonymiserte navn"
        : fields.some((x) => /firstname/i.test(x))
          ? "listen viser bare fornavn"
          : `fant ingen navnekolonne (${fields.join(", ")})`;
      warnings.push(`Liste «${list.Name}» hoppet over: ${why}`);
      continue;
    }
    if (fm.time < 0) {
      warnings.push(`Liste «${list.Name}» hoppet over: fant ingen tidskolonne (${fields.join(", ")})`);
      continue;
    }

    for (const leaf of leaves) {
      // Which group level is the contest (race)? Anything else can carry gender.
      const contestFromPath = leaf.path.map((p) => contestByNorm.get(normKey(p))).find(Boolean);
      const contestInfo =
        contestFromPath ??
        (contest !== "0"
          ? { id: contest, name: cfg.contests?.[contest] ?? `Contest ${contest}` }
          : contests.length === 1
            ? { id: contests[0][0], name: contests[0][1] }
            : leaf.path[0]
              ? { id: "", name: leaf.path[0] }
              : { id: "", name: "ALL" });
      if (SKIP_CONTEST.test(contestInfo.name)) {
        skipped += leaf.rows.length;
        continue;
      }
      const groupGender =
        leaf.path.map((p) => normalizeGender(p) ?? inferGenderFromCategory(p)).find(Boolean) ?? null;

      const raceKey = `${list.Name}|${contest}|${contestInfo.name}`;
      let race = races.get(raceKey);
      if (!race) {
        race = {
          sourceRaceId: raceKey,
          name: contestInfo.name === "ALL" ? listLabel(list) : contestInfo.name,
          distanceM: parseDistanceFromText(contestInfo.name),
          results: [],
        };
        races.set(raceKey, race);
      }

      for (const row of leaf.rows) {
        const get = (i: number) => (i >= 0 ? cleanStr(row[i]) : null);
        const rawName = fm.name >= 0 ? get(fm.name) : get(fm.last) && get(fm.first) ? `${get(fm.last)}, ${get(fm.first)}` : null;
        const timeMs = parseTimeMs(get(fm.time));
        const rankStr = get(fm.rank);
        if (!rawName || /\bN\.\s?N\.?$/i.test(rawName) || !timeMs || /^(dnf|dns|dsq|dq|nc)$/i.test(rankStr ?? "")) {
          skipped++;
          continue;
        }
        parsed++;
        const club = get(fm.club);
        const ageGroup = get(fm.ageGroup);
        const year = Number(get(fm.year));
        const result: NormalizedResult = {
          personKey: syntheticPersonId(rawName, club, null),
          name: rawName,
          gender:
            normalizeGender(get(fm.gender)) ??
            groupGender ??
            inferGender(ageGroup, prettyName(rawName)),
          birthYear: Number.isInteger(year) && year > 1900 && year < 2100 ? year : null,
          club,
          nation: flagToIoc(get(fm.nation)),
          bib: get(fm.bib),
          className: ageGroup,
          timeMs,
          sourceRank: Number((rankStr ?? "").replace(/\.$/, "")) || null,
          para: leaf.path.some((p) => isParaClass(p)) || isParaClass(ageGroup),
          raw: { source: "raceresult", eventId: Number(eventId), list: list.Name, group: leaf.path, row },
        };
        race.results.push(result);
      }
    }
  }

  return {
    source: "raceresult",
    sourceEventId: eventId,
    name: cleanStr(cfg.eventname) ?? meta?.name ?? null,
    date: meta?.dateFrom ?? null,
    location: meta?.location?.trim() || null,
    url: raceResultEventUrl(eventId),
    races: [...races.values()],
    warnings,
    stats: { parsed, skipped, lists: selections.length },
  };
}
