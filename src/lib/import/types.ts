import type { DistanceCategory } from "./distance";

export const SOURCE_SLUGS = ["eqtiming", "ultimate", "raceresult", "racedays"] as const;
export type SourceSlug = (typeof SOURCE_SLUGS)[number];

/** Sources the crawler searches for new events (Racedays is manual import only). */
export const CRAWL_SOURCES = ["eqtiming", "ultimate", "raceresult"] as const satisfies readonly SourceSlug[];

export function isSourceSlug(v: unknown): v is SourceSlug {
  return typeof v === "string" && (SOURCE_SLUGS as readonly string[]).includes(v);
}

export const SOURCE_LABELS: Record<SourceSlug, string> = {
  eqtiming: "EQ Timing",
  ultimate: "Ultimate LIVE",
  raceresult: "RaceResult",
  racedays: "Racedays",
};

/** One finisher, as delivered by a source adapter. */
export type NormalizedResult = {
  /** athlete_identities.source_person_id — a stable participant id or a synthetic hash. */
  personKey: string;
  name: string;
  gender: "M" | "F" | null;
  birthYear: number | null;
  club: string | null;
  nation: string | null;
  bib: string | null;
  className: string | null;
  timeMs: number;
  /** Rank as published by the source (only trusted when we import a subset of the field). */
  sourceRank: number | null;
  /** Para athlete (wheelchair etc.) — kept out of rankings and able-bodied places. */
  para?: boolean;
  raw: Record<string, unknown>;
};

export type NormalizedRace = {
  /** races.source_race_id — must stay stable between imports of the same event. */
  sourceRaceId: string;
  name: string;
  distanceM: number | null;
  /** Trail/mountain/relay etc. — never ranked as a road distance. */
  nonRoad?: boolean;
  results: NormalizedResult[];
};

export type NormalizedEvent = {
  source: SourceSlug;
  sourceEventId: string;
  name: string | null;
  date: string | null; // YYYY-MM-DD
  location: string | null;
  url: string | null;
  races: NormalizedRace[];
  /** When the adapter only imported part of the field (e.g. only Norwegians). */
  partialField?: boolean;
  /**
   * Race keys the source says are not races (laps/splits). Races stored under these
   * keys by earlier imports are deleted.
   */
  notRaces?: string[];
  warnings: string[];
  stats?: Record<string, number>;
};

/** Metadata-only view used by the admin preview. */
export type EventPreview = {
  source: SourceSlug;
  sourceEventId: string;
  name: string | null;
  date: string | null;
  location: string | null;
  url: string | null;
  races: { sourceRaceId: string; name: string; distanceM: number | null; category: DistanceCategory; finishers: number }[];
  warnings: string[];
};

/** Optional manual overrides from the admin UI (win over everything else). */
export type ImportOverride = {
  event_name?: string | null;
  start_date?: string | null; // YYYY-MM-DD
  location?: string | null;
  race_name?: string | null;
  distance_m?: number | null;
  distance_category?: DistanceCategory | null;
};

export type FetchOptions = {
  /** Ultimate only: import just the distance with this id. */
  ultimateDistance?: string | null;
  /** Ultimate only: keep only finishers with this nation code (e.g. "NOR"). */
  nation?: string | null;
  /** Fallback date when the source doesn't publish one (Ultimate). */
  dateHint?: string | null;
  nameHint?: string | null;
};

/** What a crawler yields for each event it sees. */
export type DiscoveredEvent = {
  source: SourceSlug;
  sourceEventId: string;
  name: string;
  date: string | null;
  location: string | null;
  country: string | null;
  sport: string | null;
  relevance: "running" | "maybe" | "irrelevant";
  /** True/false when the source tells us whether results are published; null = unknown. */
  hasResults: boolean | null;
  meta: Record<string, unknown>;
};
