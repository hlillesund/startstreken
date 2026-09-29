/*
 * Event names → the name of the race they are an edition of.
 * "Bergen City Marathon 2026", "BDO-Mila Bergen 11. juni 2025" and
 * "Frikarusellen Løp 6 2024/25 dato 19.03.2025" lose the year/date parts, so
 * every edition of a race ends up with the same key.
 */

const MONTH =
  "jan(?:uar)?|feb(?:ruar)?|mars?|apr(?:il)?|mai|juni?|juli?|aug(?:ust)?|sept?(?:ember)?|okt(?:ober)?|nov(?:ember)?|des(?:ember)?";
/** "11. juni 2025", "20. sept" — only at the end of the name or before a year, so "1. mai-løpet" survives. */
const DAY_MONTH = new RegExp(
  `(^|[^\\d])\\d{1,2}\\.?\\s*(?:${MONTH})\\.?(?:\\s+(?:19|20)\\d{2})?(?=\\s*$|\\s*[-–,]|\\s+(?:19|20)\\d{2})`,
  "giu"
);

/** Display name without year, dates and parenthesised notes. */
export function cleanEventName(name: string): string {
  let s = ` ${name} `;
  s = s.replace(/\([^)]*\)/g, " "); // "(21.sep.25)", "(utsatt fra 23.01.2021)"
  s = s.replace(/(^|[^\d])\d{1,2}\.\s?\d{1,2}\.\s?(?:\d{4}|\d{2})(?!\d)/g, "$1 "); // 13.11.2024, 19.8.24
  s = s.replace(DAY_MONTH, "$1 ");
  s = s.replace(/(^|[^\d])(?:19|20)\d{2}\s*[/-]\s*(?:\d{4}|\d{2})(?!\d)/g, "$1 "); // 2024/25
  s = s.replace(/(^|\s)\d{2}\s*[/-]\s*\d{2}(?=\s)/g, "$1 "); // "24-25" seasons
  s = s.replace(/(^|[^\d])(?:19|20)\d{2}(?!\d)/g, "$1 ");
  s = s.replace(/(^|\s)dato(?=\s)/gi, "$1 ");
  s = s.replace(/^\s*\d{1,2}\.\s+/, " "); // "10. Bergen City Marathon"
  return s
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—,.:/|#]+|[\s\-–—,.:/|#]+$/g, "")
    .trim();
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Grouping key and URL slug for a race: every edition shares it. */
export function nameKey(name: string): string {
  return slugify(cleanEventName(name));
}

/** Accepts old-style links too ("Bergen-City-Marathon-2026"). */
export function slugFromParam(param: string): string {
  return nameKey(param.replace(/[-_]+/g, " "));
}
