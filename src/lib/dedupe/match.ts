// Decides whether two athlete profiles are the same person.
//
// Hard stops (never merge): a result in the same race on both profiles (nobody
// runs a race twice), different gender, or birth years more than one apart.
// Everything else adds or removes confidence; only clear cases are merged.

export type Profile = {
  id: string;
  name: string;
  norm: string;
  gender: string | null;
  birthYear: number | null;
  results: number;
  races: Set<string>;
  clubs: Set<string>;
  places: Set<string>;
  /** Best 10 km-equivalent time per year (ms). */
  level: Map<number, number>;
};

/** How the two names relate. */
export type PairKind =
  | "spelling" // same name, written differently: "Løchen"/"Lochen", "Anne-Marie"/"Anne Marie"
  | "order" // same name parts in another order: "Engdahl Selma Løchen"
  | "subset"; // one name lacks a middle name: "Selma Engdahl" / "Selma Løchen Engdahl"

export type Verdict = { merge: boolean; maybe: boolean; reasons: string[] };

const LEVEL_SAME = 1.1; // within 10 %: same runner
const LEVEL_OFF = 1.25; // over 25 % apart in the same season: different runners

function levelCompare(a: Profile, b: Profile): "match" | "conflict" | "unknown" {
  let compared = 0;
  let worst = 1;
  for (const [year, ta] of a.level) {
    const tb = b.level.get(year);
    if (tb == null) continue;
    compared++;
    worst = Math.max(worst, Math.max(ta, tb) / Math.min(ta, tb));
  }
  if (compared === 0) return "unknown";
  if (worst > LEVEL_OFF) return "conflict";
  return worst <= LEVEL_SAME ? "match" : "unknown";
}

function overlaps<T>(a: Set<T>, b: Set<T>) {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

/**
 * @param tokens  number of name parts in the longer name
 * @param ambiguous the shorter name also fits other profiles (only for "subset")
 */
export function judge(a: Profile, b: Profile, kind: PairKind, tokens: number, ambiguous = false): Verdict {
  const reasons: string[] = [];

  // Hard stops
  if (overlaps(a.races, b.races)) return { merge: false, maybe: false, reasons: ["begge har resultat i samme løp"] };
  if (a.gender && b.gender && a.gender !== b.gender) return { merge: false, maybe: false, reasons: ["ulikt kjønn"] };
  if (a.birthYear && b.birthYear && Math.abs(a.birthYear - b.birthYear) > 1) {
    return { merge: false, maybe: false, reasons: [`ulikt fødselsår (${a.birthYear}/${b.birthYear})`] };
  }

  const birthSame = !!a.birthYear && a.birthYear === b.birthYear;
  const birthNear = !!a.birthYear && !!b.birthYear && Math.abs(a.birthYear - b.birthYear) === 1;
  const club = overlaps(a.clubs, b.clubs);
  const place = overlaps(a.places, b.places);
  const level = levelCompare(a, b);

  if (birthSame) reasons.push(`samme fødselsår (${a.birthYear})`);
  if (birthNear) reasons.push("fødselsår ett år fra hverandre");
  if (club) reasons.push("samme klubb");
  if (place) reasons.push("løper på samme steder");
  if (level === "match") reasons.push("samme nivå");
  if (level === "conflict") reasons.push("svært ulikt nivå samme sesong");

  const support = (birthSame ? 2 : 0) + (birthNear ? 1 : 0) + (club ? 1 : 0) + (level === "match" ? 1 : 0) + (place ? 0.5 : 0);
  const conflict = level === "conflict";

  let merge = false;
  if (!conflict) {
    if (kind === "spelling") {
      // the same name already merges when spelled identically, so ask for a little more
      merge = birthSame || (!(a.birthYear && b.birthYear) && support >= 1);
    } else if (kind === "order") {
      merge = tokens >= 3 ? birthSame || birthNear || support >= 1 : birthSame || (!(a.birthYear && b.birthYear) && support >= 1.5);
    } else {
      // a missing middle name is where namesakes hide: demand birth year plus more
      merge = !ambiguous && birthSame && support >= 3;
    }
  }
  return { merge, maybe: !merge && !conflict && support >= 1, reasons };
}
