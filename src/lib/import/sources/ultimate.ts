import { inferGender } from "@/lib/infer-gender";
import { fetchText } from "../http";
import { nameRelevance } from "../relevance";
import { isParaClass, parseDistanceFromText } from "../distance";
import { cleanStr, decodeEntities, parseTimeMs, stripTags, syntheticPersonId } from "../text";
import type { DiscoveredEvent, FetchOptions, NormalizedEvent, NormalizedRace, NormalizedResult } from "../types";

const BASE = "https://live.ultimate.dk/desktop";
const PAGE_SIZE = 1000;

const HEADERS = { Referer: "https://live.ultimate.dk/" };

/** Ultimate uses IOC-style country codes. */
const COUNTRY: Record<string, string> = { NOR: "NO", SWE: "SE", DEN: "DK", FIN: "FI" };

export function ultimateEventUrl(id: string | number) {
  return `${BASE}/front/index.php?eventid=${id}`;
}

/* ── Discovery ──────────────────────────────────────────────────────────── */

/** The public front page lists the ~25 most recent events worldwide. */
export async function discoverUltimate(): Promise<DiscoveredEvent[]> {
  const html = await fetchText(`${BASE}/index.php`, { headers: HEADERS });
  const out: DiscoveredEvent[] = [];
  const re =
    /<tr id="row(\d+)"[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g;
  for (const m of html.matchAll(re)) {
    const [, id, rawName, rawDate, rawCountry] = m;
    const name = stripTags(rawName);
    const ioc = stripTags(rawCountry).toUpperCase();
    const country = COUNTRY[ioc] ?? ioc;
    const relevance = nameRelevance(name, country);
    if (relevance === "irrelevant") continue;
    const d = stripTags(rawDate).match(/^(\d{2})-(\d{2})-(\d{4})$/);
    out.push({
      source: "ultimate",
      sourceEventId: id,
      name,
      date: d ? `${d[3]}-${d[2]}-${d[1]}` : null,
      location: null,
      country,
      sport: null,
      relevance,
      hasResults: null,
      meta: {},
    });
  }
  return out;
}

/* ── Event import ───────────────────────────────────────────────────────── */

type UltimateDistance = { id: string; label: string };

export async function fetchUltimateEventInfo(eventId: string) {
  const html = await fetchText(`${ultimateEventUrl(eventId)}&ignoreuseragent=true`, { headers: HEADERS });
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const name = decodeEntities(title.replace(/@\s*UltimateLIVE\s*$/i, "")).trim() || null;

  const select = html.match(/<select[^>]*id=["']?results_distance["']?[^>]*>([\s\S]*?)<\/select>/i)?.[1] ?? "";
  const distances: UltimateDistance[] = [];
  for (const o of select.matchAll(/<option[^>]*value=["']?([^"'>\s]*)["']?[^>]*>([\s\S]*?)<\/option>/gi)) {
    const id = o[1].trim();
    if (id) distances.push({ id, label: stripTags(o[2]) });
  }

  // Result groups: "S_M"/"S_W" are men/women; others like "S_P" (PARA) are separate groups.
  const catSelect = html.match(/<select[^>]*id=["']?results_category["']?[^>]*>([\s\S]*?)<\/select>/i)?.[1] ?? "";
  const paraGroups: string[] = [];
  for (const o of catSelect.matchAll(/<option[^>]*value=["']?([^"'>\s]*)["']?[^>]*>([\s\S]*?)<\/option>/gi)) {
    const id = o[1].trim();
    if (id.startsWith("S_") && (id === "S_P" || isParaClass(stripTags(o[2])))) paraGroups.push(id);
  }
  return { name, distances, paraGroups };
}

type UltimateRow = {
  rank: number | null;
  bib: string | null;
  name: string | null;
  nation: string | null;
  club: string | null;
  category: string | null;
  timeStr: string | null;
};

function unescapeJs(s: string) {
  return s
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

export function parseUltimateResults(raw: string): { rows: UltimateRow[]; total: number | null } {
  const total = Number(raw.match(/divResults_Status'\)\.innerHTML='(\d+) participant/)?.[1] ?? NaN);
  const m =
    raw.match(/document\.getElementById\('list_results'\)\.innerHTML='([\s\S]*?)';/m) ||
    raw.match(/document\.getElementById\("list_results"\)\.innerHTML="([\s\S]*?)";/m);
  if (!m) return { rows: [], total: Number.isFinite(total) ? total : null };

  const html = unescapeJs(m[1]);
  const rows: UltimateRow[] = [];
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    if (tr.includes("result_hdr")) continue;
    const tds = tr.match(/<td[\s\S]*?<\/td>/gi) ?? [];
    if (tds.length < 7) continue;
    const get = (i: number) => cleanStr(stripTags(tds[i] ?? ""));
    const rank = Number(get(0));
    rows.push({
      rank: Number.isFinite(rank) && rank > 0 ? rank : null,
      bib: get(1),
      name: get(2),
      nation: get(3),
      club: get(4),
      category: get(5),
      timeStr: get(6),
    });
  }
  return { rows, total: Number.isFinite(total) ? total : null };
}

async function fetchDistanceRows(eventId: string, distanceId: string, category = ""): Promise<UltimateRow[]> {
  const out: UltimateRow[] = [];
  const seen = new Set<string>();
  for (let page = 0; page < 200; page++) {
    const url =
      `${BASE}/front/data.php?eventid=${eventId}&mode=results&distance=${encodeURIComponent(distanceId)}` +
      `&category=${encodeURIComponent(category)}&language=us&results_startrecord=${page * PAGE_SIZE}`;
    const { rows, total } = parseUltimateResults(await fetchText(url, { headers: HEADERS }));
    let added = 0;
    for (const r of rows) {
      const key = `${r.bib ?? ""}|${r.name ?? ""}|${r.timeStr ?? ""}|${r.club ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
      added++;
    }
    // Stop on a short page, when the page repeats, or when we have everything.
    if (rows.length < PAGE_SIZE || added === 0 || (total !== null && out.length >= total)) break;
  }
  return out;
}

export async function fetchUltimateEvent(eventId: string, opts: FetchOptions = {}): Promise<NormalizedEvent> {
  const warnings: string[] = [];
  const info = await fetchUltimateEventInfo(eventId);

  let distances = info.distances;
  if (opts.ultimateDistance) {
    distances = distances.filter((d) => d.id === String(opts.ultimateDistance));
    if (distances.length === 0) distances = [{ id: String(opts.ultimateDistance), label: `Distanse ${opts.ultimateDistance}` }];
  }
  if (distances.length === 0) warnings.push("Fant ingen distanser på eventsiden");
  // Relay entries are teams, not athletes.
  const relays = distances.filter((d) => /stafett|relay/i.test(d.label));
  distances = distances.filter((d) => !relays.includes(d));
  if (relays.length) warnings.push(`Stafett hoppet over: ${relays.map((d) => d.label).join(", ")}`);

  const nation = opts.nation?.trim().toUpperCase() || null;
  const races: NormalizedRace[] = [];
  let skipped = 0;
  let fetched = 0;

  let paraCount = 0;
  for (const d of distances) {
    const rows = await fetchDistanceRows(eventId, d.id);
    fetched += rows.length;
    // The class column only shows the age group, so para athletes must be looked up per group.
    const paraKeys = new Set<string>();
    for (const g of info.paraGroups) {
      for (const p of await fetchDistanceRows(eventId, d.id, g)) paraKeys.add(`${p.bib ?? ""}|${p.name ?? ""}`);
    }
    const results: NormalizedResult[] = [];
    for (const r of rows) {
      const timeMs = parseTimeMs(r.timeStr);
      if (!r.name || !timeMs || (nation && (r.nation ?? "").toUpperCase() !== nation)) {
        skipped++;
        continue;
      }
      const para = paraKeys.has(`${r.bib ?? ""}|${r.name}`);
      if (para) paraCount++;
      results.push({
        personKey: syntheticPersonId(r.name, r.club, r.category),
        name: r.name,
        gender: inferGender(r.category, r.name),
        birthYear: null,
        club: r.club,
        nation: r.nation,
        bib: r.bib,
        className: r.category,
        timeMs,
        sourceRank: r.rank,
        para,
        raw: { source: "ultimate", ...r, ...(para ? { para: true } : {}) },
      });
    }
    races.push({ sourceRaceId: d.id, name: d.label, distanceM: parseDistanceFromText(d.label), results });
  }

  if (paraCount) warnings.push(`${paraCount} para-utøvere holdt utenfor rankingene`);

  return {
    source: "ultimate",
    sourceEventId: eventId,
    name: info.name ?? opts.nameHint ?? null,
    date: opts.dateHint ?? null,
    location: null,
    url: ultimateEventUrl(eventId),
    races,
    partialField: Boolean(nation),
    notRaces: relays.map((d) => d.id),
    warnings,
    stats: { fetched, skipped },
  };
}
