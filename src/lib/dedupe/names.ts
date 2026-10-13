// Name handling for finding duplicate athletes.
import { canonicalName } from "@/lib/import/text";

/** display_name_norm without the "#…" suffix used to keep namesakes apart. */
export function baseNorm(norm: string) {
  const i = norm.indexOf("#");
  return i === -1 ? norm : norm.slice(0, i);
}

/**
 * Folds spelling differences that sources disagree on: case, æ/ø/å, aa,
 * accents, hyphens and punctuation. "Anne-Marie Løchen" → "anne marie lochen".
 */
export function foldName(name: string) {
  return canonicalName(baseNorm(name))
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/aa/g, "a")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Name parts, without single-letter initials ("Ole K Hansen" → ole, hansen). */
export function nameTokens(name: string) {
  return foldName(name)
    .split(" ")
    .filter((t) => t.length > 1);
}

/** Order-independent key: "Engdahl Selma Løchen" and "Selma Løchen Engdahl" share it. */
export function tokenKey(tokens: string[]) {
  return [...tokens].sort().join(" ");
}

/** How often each name part is seen first and last, to tell given names from surnames. */
export type OrderStats = { first: Map<string, number>; last: Map<string, number> };

export function orderStats(names: string[]): OrderStats {
  const first = new Map<string, number>();
  const last = new Map<string, number>();
  for (const n of names) {
    const t = nameTokens(n);
    if (t.length < 2) continue;
    first.set(t[0], (first.get(t[0]) ?? 0) + 1);
    last.set(t[t.length - 1], (last.get(t[t.length - 1]) ?? 0) + 1);
  }
  return { first, last };
}

/** Typical endings of Norwegian surnames (none that also end common given names, like -as or -lie). */
const SURNAME_END = /(sen|son|dahl|dal|berg|by|rud|land|stad|heim|bakken|haug|moen|aas|lund|strand|vold|engen|holm|gaard|gard|tun|stuen|myhre|bekk|fjell|sand|skog)$/;

/** Higher when the name looks like "Given … Surname" (the order we display). */
export function orderScore(name: string, s: OrderStats) {
  const t = nameTokens(name);
  if (t.length < 2) return 0;
  const share = (m: Map<string, number>, o: Map<string, number>, k: string) => (m.get(k) ?? 0) / ((m.get(k) ?? 0) + (o.get(k) ?? 0) + 1);
  const first = t[0], last = t[t.length - 1];
  const hint = (SURNAME_END.test(last) ? 0.3 : 0) - (SURNAME_END.test(first) ? 0.3 : 0);
  return share(s.first, s.last, first) + share(s.last, s.first, last) + hint;
}
