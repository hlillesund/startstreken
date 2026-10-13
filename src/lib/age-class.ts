// Age classes for the top lists, in the usual Norwegian style:
// U20, senior (20–34) and veteran classes in five-year steps (M35, K40, …).
// Age is what the athlete turns during the season (season year − birth year).

export type AgeClass = { key: string; label: string; minAge: number; maxAge: number };

const VETERAN_STARTS = [35, 40, 45, 50, 55, 60, 65, 70, 75];

/** Class keys in display order. "U20" and "SEN" have no gender letter; veterans are "35", "40", … */
export const AGE_CLASS_KEYS = ["U20", "SEN", ...VETERAN_STARTS.map(String)] as const;

function prefix(gender: string | null | undefined) {
  return gender === "F" ? "K" : "M";
}

export function ageClassByKey(key: string, gender: string | null | undefined): AgeClass | null {
  const p = prefix(gender);
  if (key === "U20") return { key, label: `${p} U20`, minAge: 0, maxAge: 19 };
  if (key === "SEN") return { key, label: `${p} senior`, minAge: 20, maxAge: 34 };
  const start = Number(key);
  if (!VETERAN_STARTS.includes(start)) return null;
  const last = start === VETERAN_STARTS[VETERAN_STARTS.length - 1];
  return { key, label: `${p}${start}`, minAge: start, maxAge: last ? 150 : start + 4 };
}

/** The class an athlete runs in for `year`, or null without a birth year. */
export function ageClassFor(birthYear: number | null | undefined, gender: string | null | undefined, year: number): AgeClass | null {
  if (!birthYear) return null;
  const age = year - birthYear;
  if (age < 5 || age > 110) return null;
  if (age < 20) return ageClassByKey("U20", gender);
  if (age < 35) return ageClassByKey("SEN", gender);
  const start = Math.min(VETERAN_STARTS[VETERAN_STARTS.length - 1], Math.floor(age / 5) * 5);
  return ageClassByKey(String(start), gender);
}

/** Birth-year bounds (inclusive) for a class in a given season. */
export function birthRange(c: AgeClass, year: number) {
  return { from: year - c.maxAge, to: year - c.minAge };
}
