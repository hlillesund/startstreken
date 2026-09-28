import { prisma } from "@/lib/prisma";
import { upsertDiscovered } from "./crawler";
import { fetchText, mapLimit } from "./http";
import { discoverUltimate, fetchUltimateEventInfo } from "./sources/ultimate";
import type { DiscoveredEvent } from "./types";

/**
 * Ultimate LIVE has no archive, country filter or dates — only sequential event
 * ids. To find older Norwegian events we walk an id range, ask each event how
 * many Norwegian finishers it has (a cheap nation search), and queue the ones
 * with enough Norwegians under "Må vurderes" with an estimated date.
 */

const DATA = "https://live.ultimate.dk/desktop/front/data.php";
const HEADERS = { Referer: "https://live.ultimate.dk/" };

/** Number of finishers with nation NOR (0 for unknown/empty events). */
export async function countNorwegians(eventId: number): Promise<number> {
  const url =
    `${DATA}?eventid=${eventId}&mode=search&searchmode=advanced&search_quick=&language=us` +
    `&search_bib=&search_firstname=&search_lastname=&search_club=&search_city=&search_nation=NOR` +
    `&search_distance=&search_category=&search_time=Finish&search_sorttype=ASC`;
  const raw = await fetchText(url, { headers: HEADERS, timeoutMs: 30_000, retries: 1 });
  const m = raw.match(/(\d+) participant\(s\) found/);
  return m ? Number(m[1]) : 0;
}

/* ── Date estimation ────────────────────────────────────────────────────── */

type Anchor = { id: number; t: number; name?: string };

/** Name tokens for matching editions of the same race ("BMW Oslo Maraton 2025" ≈ "Oslo Marathon"). */
function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/marathon/g, "maraton")
      .replace(/[^\p{L}\s-]/gu, " ")
      .split(/[\s-]+/)
      .filter((w) => w.length > 2)
  );
}

function sameRace(a: string, b: string): boolean {
  const x = nameTokens(a);
  const y = nameTokens(b);
  if (!x.size || !y.size) return false;
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared / Math.min(x.size, y.size) >= 0.99 || shared / Math.max(x.size, y.size) >= 0.6;
}

const MONTHS: Record<string, number> = {
  jan: 1, januar: 1, january: 1,
  feb: 2, februar: 2, february: 2,
  mar: 3, mars: 3, march: 3, marts: 3,
  apr: 4, april: 4,
  mai: 5, may: 5, maj: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, november: 11,
  des: 12, desember: 12, dec: 12, december: 12,
};

/** Day/month/year mentioned in an event title, e.g. "Lierløpet - 27. september", "Oslo Maraton 2024". */
export function dateFromTitle(title: string): { year?: number; month?: number; day?: number } {
  const t = title.toLowerCase();
  const out: { year?: number; month?: number; day?: number } = {};
  const year = t.match(/\b(20\d{2})\b/);
  if (year) out.year = Number(year[1]);
  const named = t.match(/\b(\d{1,2})\.?\s*(jan|januar|january|feb|februar|february|mars|marts|march|mar|april|apr|mai|maj|may|juni|june|jun|juli|july|jul|august|aug|september|sept|sep|oktober|october|okt|oct|november|nov|desember|december|des|dec)\b/);
  const numeric = t.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
  if (named) {
    out.day = Number(named[1]);
    out.month = MONTHS[named[2]];
  } else if (numeric && Number(numeric[2]) <= 12 && Number(numeric[1]) <= 31) {
    out.day = Number(numeric[1]);
    out.month = Number(numeric[2]);
    if (numeric[3]) out.year = Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]);
  }
  return out;
}

async function loadAnchors(): Promise<Anchor[]> {
  const [events, queued] = await Promise.all([
    prisma.events.findMany({
      where: { sources: { slug: "ultimate" }, start_date: { not: null } },
      select: { source_event_id: true, start_date: true, name: true },
    }),
    prisma.import_queue.findMany({
      where: { source_slug: "ultimate", event_date: { not: null } },
      select: { source_event_id: true, event_date: true, meta: true, name: true },
    }),
  ]);
  const byId = new Map<number, Anchor>();
  for (const q of queued) {
    if ((q.meta as { dateEstimated?: boolean } | null)?.dateEstimated) continue;
    const id = Number(q.source_event_id);
    byId.set(id, { id, t: q.event_date!.getTime(), name: q.name ?? undefined });
  }
  for (const e of events) {
    const id = Number(e.source_event_id);
    byId.set(id, { id, t: e.start_date!.getTime(), name: e.name });
  }
  return [...byId.values()].filter((a) => Number.isInteger(a.id) && a.id > 0 && a.id < 100_000).sort((a, b) => a.id - b.id);
}

/** Linear interpolation of "event id → date" between the nearest known events. */
function interpolate(id: number, anchors: Anchor[]): number | null {
  if (anchors.length === 0) return null;
  if (anchors.length === 1) return anchors[0].t;
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  const slope = (last.t - first.t) / Math.max(1, last.id - first.id); // ms per id, overall trend
  const next = anchors.find((a) => a.id >= id);
  const prev = [...anchors].reverse().find((a) => a.id <= id);
  if (prev && next && next.id !== prev.id) return prev.t + ((id - prev.id) / (next.id - prev.id)) * (next.t - prev.t);
  const ref = prev ?? next!;
  return ref.t + (id - ref.id) * slope;
}

export function estimateDate(id: number, title: string, anchors: Anchor[]): { date: string | null; source: string } {
  // Scanned events already have results, so they can't be in the future.
  const raw = interpolate(id, anchors);
  const guess = raw === null ? null : Math.min(raw, Date.now());
  const fromTitle = dateFromTitle(title);
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

  if (fromTitle.month && fromTitle.day) {
    const candidates = fromTitle.year
      ? [fromTitle.year]
      : guess
        ? [-1, 0, 1].map((d) => new Date(guess).getUTCFullYear() + d)
        : [];
    const best = candidates
      .map((y) => Date.UTC(y, fromTitle.month! - 1, fromTitle.day!))
      .filter((t) => fromTitle.year || t <= Date.now())
      .sort((a, b) => Math.abs(a - (guess ?? a)) - Math.abs(b - (guess ?? b)))[0];
    if (best !== undefined) return { date: iso(best), source: fromTitle.year ? "tittel" : "tittel + anslått år" };
  }
  // A known edition of the same race: same day/month, the year closest to the estimate.
  const edition = anchors.find((a) => a.name && sameRace(a.name, title));
  if (edition && (guess !== null || fromTitle.year)) {
    const e = new Date(edition.t);
    const center = fromTitle.year ? Date.UTC(fromTitle.year, 6, 1) : guess!;
    const years = fromTitle.year ? [fromTitle.year] : [-1, 0, 1].map((d) => new Date(center).getUTCFullYear() + d);
    const best = years
      .map((y) => Date.UTC(y, e.getUTCMonth(), e.getUTCDate()))
      .filter((t) => fromTitle.year || t <= Date.now())
      .sort((a, b) => Math.abs(a - center) - Math.abs(b - center))[0];
    if (best !== undefined) return { date: iso(best), source: `samme dag som «${edition.name}»` };
  }
  if (guess === null) return { date: fromTitle.year ? `${fromTitle.year}-06-15` : null, source: "ukjent" };
  if (fromTitle.year) {
    const g = new Date(guess);
    return { date: iso(Date.UTC(fromTitle.year, g.getUTCMonth(), g.getUTCDate())), source: "år fra tittel, dag anslått" };
  }
  return { date: iso(guess), source: "anslått fra event-ID" };
}

/* ── Scan ───────────────────────────────────────────────────────────────── */

export type UltimateScanResult = {
  fromId: number;
  toId: number;
  scannedTo: number;
  nextId: number | null;
  done: boolean;
  checked: number;
  found: { id: number; name: string | null; norwegians: number; date: string | null; dateSource: string }[];
  errors: number;
};

/** Highest event id on Ultimate's front page — the natural end of a scan. */
export async function latestUltimateId(): Promise<number | null> {
  const events = await discoverUltimate().catch(() => []);
  // discoverUltimate drops obviously irrelevant events; any recent id is fine as an upper bound.
  const ids = events.map((e) => Number(e.sourceEventId)).filter(Number.isFinite);
  return ids.length ? Math.max(...ids) : null;
}

export async function scanUltimate(args: {
  fromId: number;
  toId?: number | null;
  minNorwegians?: number;
  budgetMs?: number;
  concurrency?: number;
}): Promise<UltimateScanResult> {
  const t0 = Date.now();
  const minNorwegians = Math.max(1, args.minNorwegians ?? 15);
  const toId = args.toId ?? (await latestUltimateId()) ?? args.fromId + 500;
  const budgetMs = args.budgetMs ?? 45_000;
  const concurrency = Math.min(Math.max(args.concurrency ?? 4, 1), 8);

  // Skip ids we already know about (imported or queued).
  const [inEvents, inQueue] = await Promise.all([
    prisma.events.findMany({ where: { sources: { slug: "ultimate" } }, select: { source_event_id: true } }),
    prisma.import_queue.findMany({ where: { source_slug: "ultimate" }, select: { source_event_id: true } }),
  ]);
  const known = new Set([...inEvents, ...inQueue].map((r) => Number(r.source_event_id)));
  const anchors = await loadAnchors();

  const result: UltimateScanResult = {
    fromId: args.fromId,
    toId,
    scannedTo: args.fromId - 1,
    nextId: args.fromId,
    done: false,
    checked: 0,
    found: [],
    errors: 0,
  };

  let id = args.fromId;
  while (id <= toId && Date.now() - t0 < budgetMs) {
    const batch: number[] = [];
    for (; id <= toId && batch.length < concurrency * 5; id++) if (!known.has(id)) batch.push(id);

    const counts = await mapLimit(batch, concurrency, async (eid) => {
      try {
        return { eid, n: await countNorwegians(eid) };
      } catch {
        result.errors++;
        return { eid, n: 0 };
      }
    });
    result.checked += batch.length;

    const hits = counts.filter((c) => c.n >= minNorwegians);
    const discovered: DiscoveredEvent[] = [];
    for (const h of hits) {
      const info = await fetchUltimateEventInfo(String(h.eid)).catch(() => null);
      const name = info?.name ?? `Ultimate event ${h.eid}`;
      const est = estimateDate(h.eid, name, anchors);
      discovered.push({
        source: "ultimate",
        sourceEventId: String(h.eid),
        name,
        date: est.date,
        location: null,
        country: null,
        sport: info?.distances.map((d) => d.label).join(", ") || null,
        relevance: "maybe",
        hasResults: true,
        meta: { norwegians: h.n, dateEstimated: true, dateSource: est.source, scanned: true },
      });
      result.found.push({ id: h.eid, name, norwegians: h.n, date: est.date, dateSource: est.source });
    }
    if (discovered.length) await upsertDiscovered("ultimate", discovered);
    result.scannedTo = id - 1;
  }

  result.done = id > toId;
  result.nextId = result.done ? null : id;
  return result;
}
