export type DistanceCategory = "5K" | "10K" | "HM" | "M" | "OTHER";

export const DISTANCE_CATEGORIES: DistanceCategory[] = ["5K", "10K", "HM", "M", "OTHER"];

export function isDistanceCategory(v: unknown): v is DistanceCategory {
  return typeof v === "string" && (DISTANCE_CATEGORIES as string[]).includes(v);
}

/** Accepted course lengths per ranking category (metres). */
const RANGES: [DistanceCategory, number, number][] = [
  ["5K", 4900, 5200],
  ["10K", 9900, 10300],
  ["HM", 20900, 21400],
  ["M", 41900, 42600],
];

/** Anything faster than this can't be a genuine result for the category (≈ world record). */
const MIN_PLAUSIBLE_MS: Record<Exclude<DistanceCategory, "OTHER">, number> = {
  "5K": 12 * 60_000 + 30_000,
  "10K": 26 * 60_000,
  HM: 57 * 60_000,
  M: 2 * 3_600_000,
};

export function categoryFromMeters(m: number | null | undefined): DistanceCategory | null {
  if (!m || !Number.isFinite(m)) return null;
  for (const [cat, lo, hi] of RANGES) if (m >= lo && m <= hi) return cat;
  return "OTHER";
}

/**
 * Pulls a distance out of a race label: "10 km", "21.1 KM", "5K", "3,5 km", "10000m",
 * "Halvmaraton", "Maraton", "Mila". Returns metres or null.
 */
export function parseDistanceFromText(text: string | null | undefined): number | null {
  const t = (text ?? "").toLowerCase().replace(/ /g, " ");
  if (!t.trim()) return null;

  if (/kvart\s*-?\s*maraton|quarter\s*marathon/.test(t)) return 10548;
  if (/halv\s*-?\s*maraton|half\s*-?\s*marathon|halvmara|\bhm\b/.test(t)) return 21097;
  if (/ultra/.test(t)) return null;
  if (/maraton|marathon/.test(t)) return 42195;

  const km = t.match(/(\d{1,3}(?:[.,]\d{1,3})?)\s*(?:km|k)\b/);
  if (km) return Math.round(Number(km[1].replace(",", ".")) * 1000);

  const metres = t.match(/\b(\d{3,5})\s*m(?:eter)?\b/);
  if (metres) return Number(metres[1]);

  const spaced = t.match(/\b(\d{1,2})\s?000\b/);
  if (spaced) return Number(spaced[1]) * 1000;

  // Fractions/multiples of a "mil" (10 km) must be checked before plain "mila".
  if (/halv\s*-?\s*mil(a|å|en)?(?![\p{L}])/u.test(t)) return 5000;
  if (/kvart\s*-?\s*mil(a|å|en)?(?![\p{L}])/u.test(t)) return 2500;
  if (/dobbel(t)?\s*-?\s*mil(a|å|en)?(?![\p{L}])/u.test(t)) return 20000;
  // "Mila", dialect "Milå", and compounds like "Oppdalsmila", "Gjesdalmilå", "Kvalømilen".
  if (/(mila|milå|milen|\b1 mil)(?![\p{L}])/u.test(t)) return 10000;
  return null;
}

/**
 * Trail, mountain, uphill, obstacle, relay and ultra races never count as road
 * distances. For event names (`scope: "event"`) "ultra"/"backyard" are ignored:
 * an event called "… Ultra" often has ordinary half/full marathons too.
 */
export function isNonRoad(text: string | null | undefined, scope: "race" | "event" = "race"): boolean {
  const t = (text ?? "").toLowerCase();
  if (/\b(trail|terreng|skogs\s?-?(løp|maraton|mila)|fjell\s?-?(løp|maraton)|motbakke|skyrace|sky\s?race|vertical|stafett|relay|hinderløp|ocr\b|trappeløp|orientering|turmarsj|stolpejakt)/.test(t)) {
    return true;
  }
  return scope === "race" && /\b(ultra|backyard)/.test(t);
}

/**
 * Track and indoor races (the rankings are for road running). Only strong signals:
 * meet/indoor wording, "NM-5000"-style championship names, or a race named just
 * as a track distance ("5000 meter", "10 000 m herrer A"). Anything else can be
 * set to OTHER with the per-race override in the admin.
 */
export function isTrack(eventName: string | null | undefined, raceName: string | null | undefined): boolean {
  const ev = (eventName ?? "").toLowerCase();
  const race = (raceName ?? "").toLowerCase().trim();
  const both = `${ev} ${race}`;
  if (/(stevne|banestevne|friidrettsstevne|på bane|banekarusell|indoor|innendørs|bislet|\bbaneløp)/.test(both)) return true;
  if (/\bnm[\s-]*(3000|5000|10\s?000)\b/.test(both)) return true;
  // "5000 meter", "5000m", "10 000 m herrer A" — but not "Sankthanshaugen 5000" style names.
  return /^(3000|5000|10\s?000)\s?m(eter)?(\s+(herrer|menn|kvinner|damer|gutter|jenter|junior|senior|u\d+|[a-d]|heat\s*\d*|\d+))*$/.test(race);
}

/** Road/track categories for a race from everything we know about it. */
export function classifyRace(args: {
  distanceM?: number | null;
  raceName?: string | null;
  eventName?: string | null;
  nonRoad?: boolean;
}): { category: DistanceCategory; distanceM: number | null } {
  const distanceM = args.distanceM && args.distanceM > 0 ? args.distanceM : parseDistanceFromText(args.raceName);
  const nonRoad =
    args.nonRoad ||
    isNonRoad(args.raceName) ||
    isNonRoad(args.eventName, "event") ||
    isTrack(args.eventName, args.raceName);
  if (nonRoad) return { category: "OTHER", distanceM: distanceM ?? null };
  return { category: categoryFromMeters(distanceM) ?? "OTHER", distanceM: distanceM ?? null };
}

/** Moves impossible times (faster than ~WR) out of the ranking categories. */
export function sanitizeCategory(cat: DistanceCategory, timeMs: number): DistanceCategory {
  if (cat === "OTHER") return cat;
  return timeMs < MIN_PLAUSIBLE_MS[cat] ? "OTHER" : cat;
}

/** Para classes (wheelchair, handbike, visually impaired…) aren't comparable to the open rankings. */
export function isParaClass(text: string | null | undefined): boolean {
  return /(^|[^\p{L}])(para|rullestol|handbike|hand bike|wheelchair|synshemmet|utviklingshemmet)([^\p{L}]|$)/iu.test(text ?? "");
}

/** Results faster than this are kept out of `cat` (see sanitizeCategory). */
export function minPlausibleMs(cat: DistanceCategory): number {
  return cat === "OTHER" ? 0 : MIN_PLAUSIBLE_MS[cat];
}
