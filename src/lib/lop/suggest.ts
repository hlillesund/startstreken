import type { LopGroup, LopIndex } from "./index";
import { slugify } from "./names";

/*
 * Pairs of groups that are probably the same race under different names
 * ("Fjordkraft Bergen City Marathon" / "Bergen City Marathon", "Maratonkarusellen
 * løp 1" / "Maratonkarusellen løp 1 Bergen Vintermaraton"). A race is held once
 * a year, so groups that share a year are never suggested.
 */

export type Suggestion = { a: string; b: string; score: number; reasons: string[] };

function bigrams(s: string) {
  const t = s.replace(/-/g, " ");
  const out = new Map<string, number>();
  for (let i = 0; i < t.length - 1; i++) out.set(t.slice(i, i + 2), (out.get(t.slice(i, i + 2)) ?? 0) + 1);
  return out;
}

function dice(a: Map<string, number>, b: Map<string, number>) {
  let hit = 0, na = 0, nb = 0;
  for (const v of a.values()) na += v;
  for (const v of b.values()) nb += v;
  for (const [k, v] of a) hit += Math.min(v, b.get(k) ?? 0);
  return na + nb ? (2 * hit) / (na + nb) : 0;
}

const dayOfYear = (d: string) => {
  const t = Date.parse(d);
  return Math.floor((t - Date.UTC(new Date(t).getUTCFullYear(), 0, 1)) / 86_400_000);
};

export function suggestMerges(index: LopIndex, limit = 60): Suggestion[] {
  const info = index.groups.map((g) => {
    const evs = g.eventIds.map((id) => index.events[id]);
    const dates = evs.map((e) => e.date).filter((d): d is string => !!d);
    const days = dates.map(dayOfYear).sort((x, y) => x - y);
    return {
      g,
      tokens: new Set(g.slug.split("-").filter(Boolean)),
      grams: bigrams(g.slug),
      years: new Set(dates.map((d) => d.slice(0, 4))),
      day: days.length ? days[Math.floor(days.length / 2)] : null,
      places: new Set(evs.flatMap((e) => slugify(e.location ?? "").split("-")).filter((w) => w.length > 2)),
      cats: new Set(g.courses.map((c) => c.cat)),
    };
  });

  const out: Suggestion[] = [];
  for (let i = 0; i < info.length; i++) {
    for (let j = i + 1; j < info.length; j++) {
      const A = info[i], B = info[j];
      if ([...A.years].some((y) => B.years.has(y))) continue;
      // "løp 3" and "løp 4" of a series are different races
      const numA = [...A.tokens].filter((t) => /^\d+$/.test(t));
      const numB = new Set([...B.tokens].filter((t) => /^\d+$/.test(t)));
      if (numA.length && numB.size && !numA.some((t) => numB.has(t))) continue;

      const reasons: string[] = [];
      let score = 0;
      const [small, big] = A.tokens.size <= B.tokens.size ? [A, B] : [B, A];
      const contained = small.tokens.size > 0 && [...small.tokens].every((t) => big.tokens.has(t));
      const chars = [...small.tokens].join("").length;
      if (contained && (small.tokens.size >= 2 || chars >= 8)) {
        score += 0.6;
        reasons.push("Navnet er en del av det andre");
      }
      const sim = dice(A.grams, B.grams);
      if (sim >= 0.6) {
        score += sim * 0.6;
        reasons.push(`Lignende navn (${Math.round(sim * 100)} %)`);
      }
      if (score === 0 && sim < 0.35) continue;

      const samePlace = [...A.places].some((p) => B.places.has(p));
      if (samePlace) {
        score += 0.2;
        reasons.push("Samme sted");
      }
      if (A.day != null && B.day != null) {
        const diff = Math.min(Math.abs(A.day - B.day), 365 - Math.abs(A.day - B.day));
        if (diff <= 14) {
          score += 0.2;
          reasons.push("Samme tid på året");
        } else if (diff > 60) score -= 0.4;
      }
      if (![...A.cats].some((c) => B.cats.has(c))) score -= 0.3;
      if (score >= 0.7) out.push({ a: A.g.slug, b: B.g.slug, score: Math.round(score * 100) / 100, reasons });
    }
  }
  return out.sort((x, y) => y.score - x.score).slice(0, limit);
}

export function groupBySlug(index: LopIndex): Map<string, LopGroup> {
  return new Map(index.groups.map((g) => [g.slug, g]));
}
