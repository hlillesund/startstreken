import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { legacyNormName, normName, prettyName } from "./text";

export type PersonInput = {
  personKey: string;
  name: string;
  gender: "M" | "F" | null;
  birthYear: number | null;
};

export type ResolvedPerson = { athleteId: string; gender: "M" | "F" | null };

export type ResolveStats = { persons: number; viaIdentity: number; viaName: number; created: number; enriched: number };

const CHUNK = 5000;

function chunks<T>(xs: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/**
 * Maps every person in an import to an athlete, in a handful of batched queries:
 *   1. known source identity  → that athlete (keeps manual merges intact)
 *   2. same normalised name   → existing athlete (current + legacy normalisation)
 *   3. otherwise              → new athlete
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

  // 2) Name matches for the rest
  const unresolved = [...persons.values()].filter((p) => !athleteOf.has(p.personKey));
  const lookupKeys = new Set<string>();
  for (const p of unresolved) {
    lookupKeys.add(normName(p.name));
    lookupKeys.add(legacyNormName(p.name));
  }
  const byNorm = new Map<string, string>();
  for (const keys of chunks([...lookupKeys])) {
    const rows = await prisma.athletes.findMany({
      where: { display_name_norm: { in: keys } },
      select: { id: true, display_name_norm: true },
    });
    for (const r of rows) byNorm.set(r.display_name_norm, r.id);
  }
  const findByName = (name: string) => byNorm.get(normName(name)) ?? byNorm.get(legacyNormName(name));

  // 3) Create athletes that don't exist yet
  const toCreate = new Map<string, Prisma.athletesCreateManyInput>();
  for (const p of unresolved) {
    if (findByName(p.name)) {
      stats.viaName++;
      continue;
    }
    const norm = normName(p.name);
    if (!norm || toCreate.has(norm)) continue;
    toCreate.set(norm, {
      display_name: prettyName(p.name),
      display_name_norm: norm,
      gender: p.gender,
      birth_year: p.birthYear,
    });
  }
  if (toCreate.size) {
    for (const batch of chunks([...toCreate.values()], 1000)) {
      const res = await prisma.athletes.createMany({ data: batch, skipDuplicates: true });
      stats.created += res.count;
    }
    for (const keys of chunks([...toCreate.keys()])) {
      const rows = await prisma.athletes.findMany({
        where: { display_name_norm: { in: keys } },
        select: { id: true, display_name_norm: true },
      });
      for (const r of rows) byNorm.set(r.display_name_norm, r.id);
    }
  }

  const newIdentities: Prisma.athlete_identitiesCreateManyInput[] = [];
  for (const p of unresolved) {
    const id = findByName(p.name);
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
