// Finds athletes that are the same person under different spellings of the name
// and merges the clear cases. Runs daily after the crawl (see vercel.json), and
// on demand from /api/cron/dedupe (add ?dry=1 for a report without changes).
import { prisma } from "@/lib/prisma";
import { clubSlug } from "@/lib/club-slug";
import { normName, prettyName } from "@/lib/import/text";
import { baseNorm, foldName, nameTokens, orderScore, orderStats, tokenKey } from "./names";
import { judge, type PairKind, type Profile } from "./match";
import { ensureDedupeTables, mergeAthletes } from "./merge";

const METERS: Record<string, number> = { "5K": 5000, "10K": 10000, HM: 21097.5, M: 42195 };
const MAX_GROUP = 25; // larger groups are common names; too risky to pair up blindly

type Row = { id: string; display_name: string; display_name_norm: string; gender: string | null; birth_year: number | null };
type Pair = { a: string; b: string; kind: PairKind; tokens: number; ambiguous: boolean };

export type DedupeReport = {
  dryRun: boolean;
  athletes: number;
  candidates: number;
  merged: number;
  wouldMerge: number;
  uncertain: number;
  blocked: number;
  failed: number;
  stoppedEarly: boolean;
  examples: { kept: string; removed: string; kind: PairKind; reasons: string[] }[];
  uncertainExamples: { a: string; b: string; kind: PairKind; reasons: string[] }[];
};

function chunks<T>(xs: T[], n: number) {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Candidate pairs: same folded name, same parts in another order, or a missing middle name. */
function findPairs(athletes: Row[]): Pair[] {
  const pairs = new Map<string, Pair>();
  const tokensOf = new Map<string, string[]>();
  const byFold = new Map<string, string[]>();
  const byKey = new Map<string, string[]>();
  const byEnds = new Map<string, string[]>(); // "first|last" → names with 3+ parts

  for (const a of athletes) {
    const t = nameTokens(a.display_name_norm);
    if (t.length < 2) continue;
    tokensOf.set(a.id, t);
    const push = (m: Map<string, string[]>, k: string) => (m.get(k) ?? m.set(k, []).get(k)!).push(a.id);
    push(byFold, foldName(a.display_name_norm));
    push(byKey, tokenKey(t));
    if (t.length >= 3) push(byEnds, `${t[0]}|${t[t.length - 1]}`);
  }

  const add = (a: string, b: string, kind: PairKind, ambiguous = false) => {
    const k = pairKey(a, b);
    if (pairs.has(k)) return;
    const tokens = Math.max(tokensOf.get(a)!.length, tokensOf.get(b)!.length);
    pairs.set(k, { a, b, kind, tokens, ambiguous });
  };
  const allPairs = (ids: string[], kind: PairKind) => {
    if (ids.length < 2 || ids.length > MAX_GROUP) return;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) add(ids[i], ids[j], kind);
  };

  for (const ids of byFold.values()) allPairs(ids, "spelling");
  for (const ids of byKey.values()) allPairs(ids, "order");

  // "Selma Engdahl" ⊂ "Selma Løchen Engdahl": same first and last name, middle name missing
  for (const [id, t] of tokensOf) {
    const longer = byEnds.get(`${t[0]}|${t[t.length - 1]}`);
    if (!longer) continue;
    const fits = longer.filter((other) => {
      const o = tokensOf.get(other)!;
      return o.length > t.length && t.every((x) => o.includes(x));
    });
    for (const other of fits) add(id, other, "subset", fits.length > 1);
  }
  return [...pairs.values()];
}

type EvidenceRow = { athlete_id: string; race_id: string; cat: string | null; time_ms: number; start_date: Date | null; club: string | null; location: string | null };

async function loadProfiles(rows: Row[]): Promise<Map<string, Profile>> {
  const profiles = new Map<string, Profile>();
  for (const r of rows) {
    profiles.set(r.id, {
      id: r.id,
      name: r.display_name,
      norm: r.display_name_norm,
      gender: r.gender,
      birthYear: r.birth_year,
      results: 0,
      races: new Set(),
      clubs: new Set(),
      places: new Set(),
      level: new Map(),
    });
  }
  for (const ids of chunks([...profiles.keys()], 2000)) {
    const ev = await prisma.$queryRaw<EvidenceRow[]>`
      SELECT r.athlete_id::text, r.race_id::text, r.distance_category AS cat, r.time_ms, e.start_date, r.club, e.location
      FROM results r
      JOIN races ra ON ra.id = r.race_id
      JOIN events e ON e.id = ra.event_id
      WHERE r.athlete_id = ANY(${ids}::uuid[]) AND r.time_ms > 0`;
    for (const e of ev) {
      const p = profiles.get(e.athlete_id)!;
      p.results++;
      p.races.add(e.race_id);
      if (e.club) {
        const c = clubSlug(e.club);
        if (c) p.clubs.add(c);
      }
      if (e.location) p.places.add(foldName(e.location));
      const m = e.cat ? METERS[e.cat] : undefined;
      if (m && e.start_date) {
        const y = e.start_date.getUTCFullYear();
        const eq = Number(e.time_ms) * Math.pow(10000 / m, 1.06);
        if (!p.level.has(y) || eq < p.level.get(y)!) p.level.set(y, eq);
      }
    }
  }
  return profiles;
}

/** Readability of a written name: Norwegian letters and accents count for it, sloppy punctuation against. */
function tidiness(name: string) {
  const accents = (name.normalize("NFD").match(/[\u0300-\u036f]/g) ?? []).length + (name.match(/[æøåÆØÅ]/g) ?? []).length;
  const mess = (name.match(/\?|\.\S|\s-|-\s|\/|\s{2,}|^[^a-zæøå]*$/g) ?? []).length;
  return accents - 2 * mess;
}

export async function runDedupe({ dryRun = false, budgetMs = 240_000, sample = 40 } = {}): Promise<DedupeReport> {
  const started = Date.now();
  await ensureDedupeTables();

  const athletes = await prisma.$queryRaw<Row[]>`
    SELECT id::text, display_name, display_name_norm, gender, birth_year FROM athletes`;
  const notSame = new Set(
    (await prisma.$queryRaw<{ a: string; b: string }[]>`SELECT a::text, b::text FROM athlete_not_same`).map((r) => pairKey(r.a, r.b))
  );
  const pairs = findPairs(athletes).filter((p) => !notSame.has(pairKey(p.a, p.b)));

  const byId = new Map(athletes.map((a) => [a.id, a]));
  const involved = new Set(pairs.flatMap((p) => [p.a, p.b]));
  const profiles = await loadProfiles([...involved].map((id) => byId.get(id)!));
  const stats = orderStats(athletes.map((a) => a.display_name));

  const report: DedupeReport = {
    dryRun, athletes: athletes.length, candidates: pairs.length, merged: 0, wouldMerge: 0,
    uncertain: 0, blocked: 0, failed: 0, stoppedEarly: false, examples: [], uncertainExamples: [],
  };

  // most certain first: plain spelling and order before missing middle names
  const rank: Record<PairKind, number> = { spelling: 0, order: 1, subset: 2 };
  const judged = pairs
    .map((p) => {
      const A = profiles.get(p.a)!, B = profiles.get(p.b)!;
      return { p, v: judge(A, B, p.kind, p.tokens, p.ambiguous, foldName(A.norm), foldName(B.norm)) };
    })
    .sort((x, y) => rank[x.p.kind] - rank[y.p.kind]);

  const touched = new Set<string>();
  for (const { p, v } of judged) {
    if (!v.merge) {
      if (v.maybe) {
        report.uncertain++;
        if (report.uncertainExamples.filter((e) => e.kind === p.kind).length < sample) {
          report.uncertainExamples.push({ a: byId.get(p.a)!.display_name, b: byId.get(p.b)!.display_name, kind: p.kind, reasons: v.reasons });
        }
      } else report.blocked++;
      continue;
    }
    // a profile changed earlier in this run is re-judged with its combined history next run
    if (touched.has(p.a) || touched.has(p.b)) continue;
    if (!dryRun && Date.now() - started > budgetMs) {
      report.stoppedEarly = true;
      break;
    }

    const A = profiles.get(p.a)!, B = profiles.get(p.b)!;
    // keep the profile with more results (stable links); show the better-written name
    const [kept, removed] = A.results >= B.results ? [A, B] : [B, A];
    const best =
      p.kind === "subset"
        ? nameTokens(A.norm).length > nameTokens(B.norm).length ? A : B
        : p.kind === "spelling"
          ? // "Løchen" over "Lochen", "R. Davies" over "R.Davies"
            (tidiness(A.name) === tidiness(B.name) ? kept : tidiness(A.name) > tidiness(B.name) ? A : B)
          : (() => {
            const d = orderScore(A.name, stats) - orderScore(B.name, stats);
            return Math.abs(d) > 0.05 ? (d > 0 ? A : B) : kept;
          })();
    const name = prettyName(best.name);
    const norm = best.norm.includes("#") ? best.norm : normName(best.name) || baseNorm(best.norm);

    touched.add(p.a);
    touched.add(p.b);
    if (report.examples.filter((e) => e.kind === p.kind).length < sample) report.examples.push({ kept: name, removed: best === kept ? removed.name : kept.name, kind: p.kind, reasons: v.reasons });

    if (dryRun) {
      report.wouldMerge++;
      continue;
    }
    try {
      const ok = await mergeAthletes({ keptId: kept.id, removedId: removed.id, name, norm, kind: p.kind, reasons: v.reasons });
      if (ok) report.merged++;
    } catch (e) {
      report.failed++;
      console.error("[dedupe] merge failed", kept.id, removed.id, e);
    }
  }
  return report;
}
