import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { legacyNormName, normName, prettyName } from "./text";
import { baseNorm } from "@/lib/dedupe/names";
import { ensureDedupeTables } from "@/lib/dedupe/merge";

export type PersonInput = {
  personKey: string;
  name: string;
  gender: "M" | "F" | null;
  birthYear: number | null;
};

export type ResolvedPerson = { athleteId: string; gender: "M" | "F" | null };

export type ResolveStats = { persons: number; viaIdentity: number; viaName: number; created: number; enriched: number };

const CHUNK = 5000;

/** An existing athlete (id) or one planned in this import (id null). */
type Candidate = { id: string | null; norm: string; gender: string | null; birthYear: number | null };

function compatible(c: Candidate, p: PersonInput) {
  if (p.gender && c.gender && p.gender !== c.gender) return false;
  if (p.birthYear && c.birthYear && Math.abs(p.birthYear - c.birthYear) > 1) return false;
  return true;
}

/** Best profile for a person among those with the same name: same birth year first, then the plain name. */
function pickCandidate(cands: Candidate[], p: PersonInput): Candidate | null {
  const ok = cands.filter((c) => compatible(c, p));
  if (!ok.length) return null;
  const score = (c: Candidate) =>
    (p.birthYear && c.birthYear === p.birthYear ? 4 : 0) + (p.birthYear && c.birthYear && c.birthYear !== p.birthYear ? -1 : 0) + (c.norm.includes("#") ? 0 : 1);
  return ok.sort((a, b) => score(b) - score(a))[0];
}

function chunks<T>(xs: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/**
 * Maps every person in an import to an athlete, in a handful of batched queries:
 *   1. known source identity  → that athlete (keeps manual merges intact)
 *   2. same normalised name   → existing athlete (current + legacy normalisation, and
 *      spellings recorded in athlete_aliases), unless gender or birth year rules it out
 *   3. otherwise              → new athlete (a namesake gets a "#…" suffix on its key)
 * New identities are recorded, and missing gender / birth year are filled in on
 * existing athletes (never overwritten).
 */
export async function resolveAthletes(
  sourceId: string,
  inputs: PersonInput[]
): Promise<{ map: Map<string, ResolvedPerson>; stats: ResolveStats }> {
  // Merge duplicates of the same person, keeping the first known gender/year.
  const persons = new Map<string, PersonInput>();
  for (const p of inputs) {
    const prev = persons.get(p.personKey);
    if (!prev) persons.set(p.personKey, { ...p });
    else {
      prev.gender ??= p.gender;
      prev.birthYear ??= p.birthYear;
    }
  }
  const stats: ResolveStats = { persons: persons.size, viaIdentity: 0, viaName: 0, created: 0, enriched: 0 };
  const athleteOf = new Map<string, string>();

  // 1) Existing identities
  for (const keys of chunks([...persons.keys()])) {
    const rows = await prisma.athlete_identities.findMany({
      where: { source_id: sourceId, source_person_id: { in: keys } },
      select: { source_person_id: true, athlete_id: true },
    });
    for (const r of rows) athleteOf.set(r.source_person_id, r.athlete_id);
  }
  stats.viaIdentity = athleteOf.size;

  // 2) Name matches for the rest: the name itself, namesakes kept apart with a
  //    "#…" suffix, and other spellings recorded when profiles were merged.
  await ensureDedupeTables();
  const unresolved = [...persons.values()].filter((p) => !athleteOf.has(p.personKey));
  const lookupKeys = new Set<string>();
  for (const p of unresolved) {
    lookupKeys.add(normName(p.name));
    lookupKeys.add(legacyNormName(p.name));
  }
  lookupKeys.delete("");
  const byBase = new Map<string, Candidate[]>();
  const addCand = (base: string, c: Candidate) => {
    const list = byBase.get(base) ?? byBase.set(base, []).get(base)!;
    if (!list.some((x) => x.norm === c.norm)) list.push(c);
  };
  for (const keys of chunks([...lookupKeys])) {
    const patterns = keys.map((k) => `${k.replace(/[\\%_]/g, "\\$&")}#%`);
    const rows = await prisma.$queryRaw<{ id: string; norm: string; gender: string | null; birth_year: number | null; alias: string | null }[]>`
      SELECT a.id::text, a.display_name_norm AS norm, a.gender, a.birth_year, NULL::text AS alias
      FROM athletes a
      WHERE a.display_name_norm = ANY(${keys}) OR a.display_name_norm LIKE ANY(${patterns})
      UNION ALL
      SELECT a.id::text, a.display_name_norm AS norm, a.gender, a.birth_year, al.name_norm AS alias
      FROM athlete_aliases al JOIN athletes a ON a.id = al.athlete_id
      WHERE al.name_norm = ANY(${keys})`;
    for (const r of rows) {
      addCand(r.alias ?? baseNorm(r.norm), { id: r.id, norm: r.norm, gender: r.gender, birthYear: r.birth_year });
    }
  }

  // 3) Pick a compatible profile, or plan a new one. A name match with a different
  //    gender or a birth year more than one apart is a namesake, not the same person.
  const planned = new Map<string, Prisma.athletesCreateManyInput>();
  const plannedFor = new Map<string, string>(); // personKey → norm of a planned athlete
  for (const p of unresolved) {
    const norm = normName(p.name);
    if (!norm) continue;
    const cands = [...(byBase.get(norm) ?? []), ...(byBase.get(legacyNormName(p.name)) ?? [])];
    const pick = pickCandidate(cands, p);
    if (pick) {
      if (pick.id) {
        athleteOf.set(p.personKey, pick.id);
        stats.viaName++;
      } else plannedFor.set(p.personKey, pick.norm);
      continue;
    }
    // nobody compatible: a new profile, under the bare name if it is free
    let key = norm;
    if (cands.length) {
      const tag = p.birthYear ?? (p.gender ? p.gender.toLowerCase() : "x");
      key = `${norm}#${tag}`;
      for (let n = 2; cands.some((c) => c.norm === key) || planned.has(key); n++) key = `${norm}#${tag}-${n}`;
    }
    planned.set(key, { display_name: prettyName(p.name), display_name_norm: key, gender: p.gender, birth_year: p.birthYear });
    addCand(norm, { id: null, norm: key, gender: p.gender, birthYear: p.birthYear });
    plannedFor.set(p.personKey, key);
  }

  if (planned.size) {
    for (const batch of chunks([...planned.values()], 1000)) {
      const res = await prisma.athletes.createMany({ data: batch, skipDuplicates: true });
      stats.created += res.count;
    }
  }
  const plannedIds = new Map<string, string>();
  const wanted = [...new Set(plannedFor.values())];
  for (const keys of chunks(wanted)) {
    const rows = await prisma.athletes.findMany({ where: { display_name_norm: { in: keys } }, select: { id: true, display_name_norm: true } });
    for (const r of rows) plannedIds.set(r.display_name_norm, r.id);
  }

  const newIdentities: Prisma.athlete_identitiesCreateManyInput[] = [];
  for (const p of unresolved) {
    const planned = plannedFor.get(p.personKey);
    const id = planned ? plannedIds.get(planned) : athleteOf.get(p.personKey);
    if (!id) continue;
    athleteOf.set(p.personKey, id);
    newIdentities.push({ source_id: sourceId, source_person_id: p.personKey, athlete_id: id });
  }
  for (const batch of chunks(newIdentities, 1000)) {
    await prisma.athlete_identities.createMany({ data: batch, skipDuplicates: true });
  }

  // 4) Current gender/birth year of everyone involved; fill in blanks we now know.
  const athleteIds = [...new Set(athleteOf.values())];
  const current = new Map<string, { gender: string | null; birth_year: number | null }>();
  for (const ids of chunks(athleteIds)) {
    const rows = await prisma.athletes.findMany({
      where: { id: { in: ids } },
      select: { id: true, gender: true, birth_year: true },
    });
    for (const r of rows) current.set(r.id, { gender: r.gender, birth_year: r.birth_year });
  }

  const updates = new Map<string, { gender: string | null; birth_year: number | null }>();
  for (const p of persons.values()) {
    const id = athleteOf.get(p.personKey);
    const cur = id ? current.get(id) : undefined;
    if (!id || !cur) continue;
    const gender = !cur.gender && p.gender ? p.gender : null;
    const birth = !cur.birth_year && p.birthYear ? p.birthYear : null;
    if (!gender && !birth) continue;
    const u = updates.get(id) ?? { gender: null, birth_year: null };
    u.gender ??= gender;
    u.birth_year ??= birth;
    updates.set(id, u);
    if (gender) cur.gender = gender;
    if (birth) cur.birth_year = birth;
  }
  for (const batch of chunks([...updates.entries()], 1000)) {
    const values = batch.map(
      ([id, u]) => Prisma.sql`(${id}::uuid, ${u.gender}::text, ${u.birth_year}::int)`
    );
    stats.enriched += await prisma.$executeRaw`
      UPDATE public.athletes a
      SET gender = COALESCE(a.gender, v.gender),
          birth_year = COALESCE(a.birth_year, v.birth_year)
      FROM (VALUES ${Prisma.join(values)}) AS v(id, gender, birth_year)
      WHERE a.id = v.id`;
  }

  const map = new Map<string, ResolvedPerson>();
  for (const [key, athleteId] of athleteOf) {
    const g = current.get(athleteId)?.gender;
    map.set(key, { athleteId, gender: g === "M" || g === "F" ? g : null });
  }
  return { map, stats };
}
