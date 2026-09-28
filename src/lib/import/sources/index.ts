import type { DiscoveredEvent, FetchOptions, NormalizedEvent, SourceSlug } from "../types";
import { discoverEq, eqEventUrl, fetchEqEvent } from "./eqtiming";
import { fetchRacedaysEvent, parseRacedaysRef, racedaysEventUrl } from "./racedays";
import { discoverRaceResult, fetchRaceResultEvent, raceResultEventUrl } from "./raceresult";
import { discoverUltimate, fetchUltimateEvent, ultimateEventUrl } from "./ultimate";

function fetchRaw(source: SourceSlug, eventId: string, opts: FetchOptions): Promise<NormalizedEvent> {
  switch (source) {
    case "eqtiming":
      return fetchEqEvent(eventId);
    case "ultimate":
      return fetchUltimateEvent(eventId, opts);
    case "raceresult":
      return fetchRaceResultEvent(eventId);
    case "racedays":
      return fetchRacedaysEvent(eventId);
  }
}

const NORWEGIAN = new Set(["NOR", "NO"]);

/**
 * The site is about Norwegian runners. For a race abroad (most finishers with a
 * known nationality are not Norwegian) keep only the Norwegians; their places are
 * then taken from the source, since the rest of the field isn't imported.
 */
export function keepOnlyNorwegiansAbroad(ev: NormalizedEvent): NormalizedEvent {
  if (ev.partialField) return ev; // already filtered (e.g. "Kun nasjon")
  const all = ev.races.flatMap((r) => r.results);
  const known = all.filter((x) => x.nation);
  const norwegians = known.filter((x) => NORWEGIAN.has(x.nation!.toUpperCase()));
  if (known.length < 50 || known.length < all.length * 0.8 || norwegians.length >= known.length * 0.5) return ev;

  return {
    ...ev,
    partialField: true,
    races: ev.races.map((r) => ({ ...r, results: r.results.filter((x) => x.nation && NORWEGIAN.has(x.nation.toUpperCase())) })),
    warnings: [
      ...ev.warnings,
      `Løp i utlandet: bare ${norwegians.length} av ${known.length} deltakere er norske — importerer kun nordmenn (plasseringer fra arrangøren)`,
    ],
  };
}

export async function fetchEvent(source: SourceSlug, eventId: string, opts: FetchOptions = {}): Promise<NormalizedEvent> {
  return keepOnlyNorwegiansAbroad(await fetchRaw(source, eventId, opts));
}

/** Splits [from, to] into windows of at most `days` days (inclusive, YYYY-MM-DD). */
function windows(from: string, to: string, days: number): [string, string][] {
  const out: [string, string][] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += days * 86_400_000) {
    const wEnd = Math.min(t + (days - 1) * 86_400_000, end);
    out.push([new Date(t).toISOString().slice(0, 10), new Date(wEnd).toISOString().slice(0, 10)]);
  }
  return out;
}

async function discoverWindowed(
  from: string,
  to: string,
  days: number,
  fn: (from: string, to: string) => Promise<DiscoveredEvent[]>
): Promise<DiscoveredEvent[]> {
  const seen = new Map<string, DiscoveredEvent>();
  for (const [a, b] of windows(from, to, days)) for (const e of await fn(a, b)) seen.set(e.sourceEventId, e);
  return [...seen.values()];
}

/**
 * Events in the date range. Long ranges (backfills) are fetched in windows so no
 * single request hits the providers' result caps. Ultimate only exposes its most
 * recent events, so the range doesn't apply there.
 */
export function discover(source: SourceSlug, from: string, to: string): Promise<DiscoveredEvent[]> {
  switch (source) {
    case "eqtiming":
      return discoverWindowed(from, to, 31, discoverEq);
    case "ultimate":
      return discoverUltimate();
    case "raceresult":
      return discoverWindowed(from, to, 366, discoverRaceResult);
    case "racedays":
      return Promise.resolve([]);
  }
}

export function sourceEventUrl(source: SourceSlug, eventId: string): string {
  switch (source) {
    case "eqtiming":
      return eqEventUrl(eventId);
    case "ultimate":
      return ultimateEventUrl(eventId);
    case "raceresult":
      return raceResultEventUrl(eventId);
    case "racedays":
      return racedaysEventUrl(eventId);
  }
}

/**
 * Accepts a pasted URL or id and works out source + event id:
 *   https://live.eqtiming.com/80410#result          → eqtiming 80410
 *   https://live.ultimate.dk/...index.php?eventid=7382 → ultimate 7382
 *   https://my.raceresult.com/258952/results        → raceresult 258952
 */
export function parseEventRef(input: string): { source: SourceSlug | null; eventId: string | null } {
  const s = (input ?? "").trim();
  if (/^\d+$/.test(s)) return { source: null, eventId: s };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return { source: "racedays", eventId: s.toLowerCase() };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return { source: null, eventId: null };
  }
  const host = url.hostname.toLowerCase();
  if (host.includes("eqtiming")) {
    const id = url.pathname.match(/\/(\d+)/)?.[1] ?? url.searchParams.get("eventId") ?? url.searchParams.get("eventid");
    return { source: "eqtiming", eventId: id ?? null };
  }
  if (host.includes("ultimate.dk")) {
    return { source: "ultimate", eventId: url.searchParams.get("eventid") ?? url.searchParams.get("eventId") };
  }
  if (host.includes("racedays")) {
    return { source: "racedays", eventId: parseRacedaysRef(s) };
  }
  if (host.includes("raceresult")) {
    const id = url.pathname.match(/\/(\d+)/)?.[1] ?? url.searchParams.get("eventid");
    return { source: "raceresult", eventId: id ?? null };
  }
  return { source: null, eventId: null };
}
