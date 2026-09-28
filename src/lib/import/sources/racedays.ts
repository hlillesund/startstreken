import { fetchText } from "../http";
import { cleanStr, parseTimeMs } from "../text";
import type { NormalizedEvent, NormalizedRace, NormalizedResult } from "../types";

/**
 * Racedays (racedays.run). Its JSON API now requires an API key, but the public
 * result pages embed the same data as prerendered Blazor component state, so we
 * read those — politely, one page (25 finishers) at a time. Pages accept either
 * the event slug or the event UUID, so re-imports work from the stored UUID.
 */

const BASE = "https://www.racedays.run";
/** Pause between page requests — a big event is ~50 pages. */
const PAGE_DELAY_MS = 250;
const MAX_PAGES = 400;

export function racedaysEventUrl(ref: string) {
  return `${BASE}/event/${ref}/results/`;
}

type RdRace = { id: string; name: string; meters: number | null; participantsCount?: number; distanceName?: string };
type RdEvent = { id: string; slug: string; name: string; date: string | null; location: string | null; country: string | null; races: RdRace[] };
type RdResult = {
  id: string;
  bib: number | null;
  name: string;
  raceId: string;
  time: string | null;
  elapsedChipTime: string | null;
  positionChipOverall: number | null;
  gender: number | null;
  birthyear: number | null;
  country: string | null;
  class: string | null;
  club: string | null;
  teamName: string | null;
  hasCompleted: boolean;
};
type RdPage = { isSuccess: boolean; pageNumber: number; pageCount: number; data: RdResult[] };

/** Decodes the Blazor persisted-state blob and returns every JSON value in it. */
function pageState(html: string): unknown[] {
  const m = html.match(/<!--Blazor-(?:WebAssembly-)?Component-State:([A-Za-z0-9+/=]+)-->/);
  if (!m) return [];
  const outer = JSON.parse(Buffer.from(m[1], "base64").toString("utf8")) as Record<string, string>;
  const out: unknown[] = [];
  for (const v of Object.values(outer)) {
    try {
      out.push(JSON.parse(Buffer.from(v, "base64").toString("utf8")));
    } catch {
      // not JSON — ignore
    }
  }
  return out;
}

function findEvent(state: unknown[]): RdEvent | null {
  for (const s of state) {
    const d = (s as { data?: unknown })?.data as Partial<RdEvent> | undefined;
    if (d && typeof d === "object" && !Array.isArray(d) && typeof d.id === "string" && Array.isArray(d.races)) {
      return d as RdEvent;
    }
  }
  return null;
}

function findResults(state: unknown[]): RdPage | null {
  for (const s of state) {
    const p = s as Partial<RdPage>;
    if (p && Array.isArray(p.data) && typeof p.pageCount === "number") return p as RdPage;
  }
  return null;
}

async function fetchPage(url: string): Promise<unknown[]> {
  return pageState(await fetchText(url, { timeoutMs: 45_000 }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Accepts a Racedays URL, slug or event UUID. */
export function parseRacedaysRef(input: string): string | null {
  const m = input.match(/racedays\.run\/event\/([^/?#]+)/i);
  const ref = (m ? m[1] : input).trim();
  return /^[a-z0-9-]{3,120}$/i.test(ref) ? ref.toLowerCase() : null;
}

export async function fetchRacedaysEvent(ref: string): Promise<NormalizedEvent> {
  const warnings: string[] = [];
  const event = findEvent(await fetchPage(racedaysEventUrl(ref)));
  if (!event) throw new Error("Racedays: fant ikke eventdata på resultatsiden");

  const races: NormalizedRace[] = [];
  let pages = 0;
  let skipped = 0;

  for (const race of event.races) {
    if (race.participantsCount === 0) continue;
    const results: NormalizedResult[] = [];
    let pageCount = 1;

    for (let n = 1; n <= Math.min(pageCount, MAX_PAGES); n++) {
      if (pages > 0) await sleep(PAGE_DELAY_MS);
      const page = findResults(await fetchPage(`${BASE}/event/${event.id}/results/${race.id}?pageNumber=${n}`));
      pages++;
      if (!page) {
        if (n === 1) warnings.push(`${race.name}: ingen resultater publisert`);
        break;
      }
      pageCount = page.pageCount;
      if (page.pageNumber < n) break; // asked past the last page

      for (const r of page.data) {
        if (r.raceId && r.raceId !== race.id) continue;
        const timeMs = parseTimeMs(r.elapsedChipTime) ?? parseTimeMs(r.time);
        const name = cleanStr(r.name);
        if (!r.hasCompleted || !timeMs || !name) {
          skipped++;
          continue;
        }
        results.push({
          personKey: r.id,
          name,
          gender: r.gender === 0 ? "M" : r.gender === 1 ? "F" : null,
          birthYear: r.birthyear && r.birthyear > 1900 ? r.birthyear : null,
          club: cleanStr(r.club) ?? cleanStr(r.teamName),
          nation: cleanStr(r.country),
          bib: r.bib != null ? String(r.bib) : null,
          className: cleanStr(r.class),
          timeMs,
          sourceRank: r.positionChipOverall ?? null,
          raw: {
            source: "racedays",
            eventId: event.id,
            raceId: race.id,
            class: r.class,
            country: r.country,
            birthyear: r.birthyear,
            chipTime: r.elapsedChipTime,
            gunTime: r.time,
          },
        });
      }
    }
    races.push({ sourceRaceId: race.id, name: race.name || race.distanceName || "Løp", distanceM: race.meters || null, results });
  }

  return {
    source: "racedays",
    sourceEventId: event.id,
    name: cleanStr(event.name),
    date: event.date ? event.date.slice(0, 10) : null,
    location: cleanStr(event.location),
    url: racedaysEventUrl(event.slug || event.id),
    races,
    warnings,
    stats: { pages, skipped },
  };
}
