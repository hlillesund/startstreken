import type { DiscoveredEvent } from "./types";

type Relevance = DiscoveredEvent["relevance"];

/** Placeholder/admin events that timing providers publish alongside real races. */
const JUNK_NAME =
  /(?:^|[^\p{L}])(test|påmelding|pamelding|gavekort|afterparty|kurs|kopi|avlyst|cancelled|samling)(?![\p{L}]*løp)/iu;

const RUNNING_NAME =
  /(løp|lop\b|run\b|running|jogg|maraton|marathon|mila\b|milen\b|karusell|trail|ultra|backyard|\d+\s?k(m)?\b|terreng|motbakke|skyrace)/i;

/** Sports federations whose results are not running (EQ history items carry "Forbund"). */
export const NON_RUNNING_FEDERATION = /(ski|cykle|sykkel|orientering|triatlon|triathlon|skiskyting|svøm|padle|roing|hund|motor|skøyte)/i;
/** Same pattern for Postgres `~*` (kept in sync with NON_RUNNING_FEDERATION). */
export const NON_RUNNING_FEDERATION_SQL = "(ski|cykle|sykkel|orientering|triatlon|triathlon|skiskyting|svøm|padle|roing|hund|motor|skøyte)";

const NON_RUNNING_NAME =
  /(sykkel|ritt\b|\britt|cycling|gravel|\bmtb\b|langrenn|\bski\b|skiløp|skirenn|skiskyting|triatlon|triathlon|ironman|svøm|swim|padle|roing|orientering|hundekjør|slede|enduro|rally|bmx)/i;

/**
 * EQ Timing sport tree ids (from /api/Events). 15 = Athletics; the rest are
 * running-like sports filed under "Others".
 */
const EQ_ATHLETICS_ROOT = 15;
const EQ_EXCLUDED_ATHLETICS = new Set([
  79, // Kappgang
  80, // Turmarsj
  445, // Turmarsj
  436, // Barneløp
  441, // Stafett
]);
const EQ_RUNNING_OTHERS = new Set([48 /* Løp */, 461 /* Backyard */, 147 /* Langløp */]);
/**
 * "Idrettsskoler" holds school runs but also plenty of public races, so only
 * events whose name or organizer points to a school are held for review.
 */
const EQ_SCHOOL = 30;
const SCHOOL_NAME = /(\bvgs\b|videregående|skole|skule|\bvgs?\d|elevløp|skoleløp)/i;
const EQ_MAYBE_OTHERS = new Set([
  EQ_SCHOOL,
  32, // Mosjonsidrettsgrupper
  47, // Aktiv bedrift
  455, // Annet
  265, // Ingen
  264, // Generell
  1, // Ikke angitt
]);

export function eqRelevance(args: {
  name: string;
  country: string | null;
  sportIds: number[];
  organizer?: string | null;
}): Relevance {
  const { name, country, sportIds } = args;
  if (country && country !== "NO") return "irrelevant";
  if (JUNK_NAME.test(name)) return "irrelevant";

  const [leaf] = sportIds;
  if (leaf === EQ_SCHOOL && (SCHOOL_NAME.test(name) || SCHOOL_NAME.test(args.organizer ?? ""))) return "maybe";
  if (sportIds.includes(EQ_ATHLETICS_ROOT)) {
    return EQ_EXCLUDED_ATHLETICS.has(leaf) ? "irrelevant" : "running";
  }
  if (EQ_RUNNING_OTHERS.has(leaf)) return NON_RUNNING_NAME.test(name) ? "maybe" : "running";
  if (EQ_MAYBE_OTHERS.has(leaf)) {
    if (NON_RUNNING_NAME.test(name)) return "irrelevant";
    return RUNNING_NAME.test(name) ? "running" : "maybe";
  }
  return "irrelevant";
}

/** For sources that already filter on country + running (RaceResult) or only give us a name (Ultimate). */
export function nameRelevance(name: string, country: string | null): Relevance {
  if (country && country !== "NO") return "irrelevant";
  if (JUNK_NAME.test(name)) return "irrelevant";
  if (NON_RUNNING_NAME.test(name)) return "maybe";
  return "running";
}
