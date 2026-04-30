import { prisma } from "@/lib/prisma";
import { inferGender } from "@/lib/infer-gender";
import crypto from "crypto";
import type { UltimateRow } from "@/lib/ultimate-parse";

function shortHash(s: string) {
  return crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);
}

function timeToMs(time: string): number | null {
  const parts = time.trim().split(":").map(Number);
  if (parts.some(Number.isNaN)) return null;
  let h = 0, m = 0, s = 0;
  if (parts.length === 3) [h, m, s] = parts;
  else if (parts.length === 2) [m, s] = parts;
  else return null;
  return (h * 3600 + m * 60 + s) * 1000;
}

function makePersonId(r: UltimateRow) {
  return `synt:${shortHash(`${r.name}|${r.club ?? ""}|${r.category ?? ""}`)}`;
}

function normName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function importUltimateBatch({
  rows,
  raceId,
  distanceCategory,
  sourceId,
}: {
  rows: UltimateRow[];
  raceId: string;
  distanceCategory: string | null;
  sourceId: string;
}) {
  // Filter out rows missing name or a valid time
  const valid = rows.flatMap((r) => {
    if (!r.name || !r.timeStr) return [];
    const timeMs = timeToMs(r.timeStr);
    if (!timeMs) return [];
    return [{ row: r, timeMs, personId: makePersonId(r) }];
  });

  if (valid.length === 0) return { imported: 0, linked: 0, skipped: rows.length };

  const personIds = [...new Set(valid.map((v) => v.personId))];

  // One query to load all known identities
  const existingIdentities = await prisma.athlete_identities.findMany({
    where: { source_id: sourceId, source_person_id: { in: personIds } },
    select: { source_person_id: true, athlete_id: true },
  });
  const identityMap = new Map(existingIdentities.map((i) => [i.source_person_id, i.athlete_id]));

  // Only process person IDs we haven't seen before
  const newPersonIds = personIds.filter((id) => !identityMap.has(id));
  const newValidByPersonId = new Map<string, (typeof valid)[number]>();
  for (const v of valid) {
    if (newPersonIds.includes(v.personId) && !newValidByPersonId.has(v.personId)) {
      newValidByPersonId.set(v.personId, v);
    }
  }

  if (newValidByPersonId.size > 0) {
    const normNames = [...newValidByPersonId.values()].map((v) => normName(v.row.name!));

    // One query to find athletes that already exist by name
    const existingAthletes = await prisma.athletes.findMany({
      where: { display_name_norm: { in: normNames } },
      select: { id: true, display_name_norm: true },
    });
    const athleteByNorm = new Map(existingAthletes.map((a) => [a.display_name_norm, a.id]));

    // Bulk-create any athletes that don't exist yet
    const toCreate = [...newValidByPersonId.values()]
      .filter((v) => !athleteByNorm.has(normName(v.row.name!)))
    .map((v) => ({
  display_name: v.row.name!,
  display_name_norm: normName(v.row.name!),
  gender: inferGender(v.row.category, v.row.name),
}));

    if (toCreate.length > 0) {
      await prisma.athletes.createMany({ data: toCreate, skipDuplicates: true });
      const created = await prisma.athletes.findMany({
        where: { display_name_norm: { in: toCreate.map((a) => a.display_name_norm) } },
        select: { id: true, display_name_norm: true },
      });
      for (const a of created) athleteByNorm.set(a.display_name_norm, a.id);
    }

    // Bulk-create identities for new persons
    const newIdentities = [...newValidByPersonId.values()].flatMap((v) => {
      const athleteId = athleteByNorm.get(normName(v.row.name!));
      if (!athleteId) return [];
      identityMap.set(v.personId, athleteId);
      return [{ source_id: sourceId, source_person_id: v.personId, athlete_id: athleteId }];
    });

    if (newIdentities.length > 0) {
      await prisma.athlete_identities.createMany({ data: newIdentities, skipDuplicates: true });
    }
  }

  // Build all result rows in memory
  const resultRows = valid.flatMap((v) => {
    const athleteId = identityMap.get(v.personId);
    if (!athleteId) return [];
    return [{
      race_id: raceId,
      athlete_id: athleteId,
      time_ms: v.timeMs,
      rank_overall: v.row.rank ?? null,
      bib: v.row.bib ?? null,
      club: v.row.club ?? null,
      raw: v.row as any,
      distance_category: distanceCategory,
    }];
  });

  // Wipe old results for this race, then insert fresh
  await prisma.results.deleteMany({ where: { race_id: raceId } });

  let imported = 0;
  const CHUNK = 500;
  for (let i = 0; i < resultRows.length; i += CHUNK) {
    const res = await prisma.results.createMany({
      data: resultRows.slice(i, i + CHUNK),
      skipDuplicates: true,
    });
    imported += res.count;
  }

  return { imported, linked: existingIdentities.length, skipped: rows.length - valid.length };
}