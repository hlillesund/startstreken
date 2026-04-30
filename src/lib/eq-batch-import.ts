import { prisma } from "@/lib/prisma";

function normName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// ── Startlist helpers (same field-picking logic you already have) ──────────────

function getName(p: any): string | null {
  const u = p?.Utover ?? p?.utover ?? p?.Athlete ?? null;
  const direct = u?.NavnFormatert ?? u?.NameFormatted ?? u?.FullName;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const fn = (u?.Fornavn ?? u?.FirstName ?? "").toString().trim();
  const ln = (u?.Etternavn ?? u?.LastName ?? "").toString().trim();
  const combined = `${fn} ${ln}`.trim();
  return combined.length >= 2 ? combined : null;
}

function getUid(p: any): string | null {
  const uid = p?.Utover?.UID ?? p?.Utover?.Id ?? null;
  if (uid == null) return null;
  const s = String(uid).trim();
  return s || null;
}

function getBib(p: any): string | null {
  const candidates = ["Startnumber","StartNumber","StartNr","StartNo","Startnummer","Bib","BIB"];
  for (const k of candidates) {
    const v = (p as any)?.[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  const u = p?.Utover ?? p?.utover ?? p?.Athlete ?? null;
  for (const k of candidates) {
    const v = u?.[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  const v = p?.Startnummer ?? p?.FullStartnummer ?? null;
  if (v != null && String(v).trim()) return String(v).trim();
  const key = Object.keys(p ?? {}).find((k) => /start|bib/i.test(k));
  if (key) { const mv = (p as any)[key]; if (mv != null && String(mv).trim()) return String(mv).trim(); }
  return null;
}

function getClassName(p: any): string | null {
  const c = p?.Klasse?.Navn ?? p?.Klasse?.Name ?? p?.Class ?? p?.class ?? null;
  if (typeof c !== "string") return null;
  return c.trim() || null;
}

// ── BATCH STARTLIST IMPORT ────────────────────────────────────────────────────

export async function importEqStartlistBatch(
  sourceId: string,
  eventId: number,
  items: any[]
): Promise<{ imported: number; skipped: number }> {
  // 1) Deduplicate by UID
  const seen = new Set<string>();
  const valid: Array<{ name: string; uid: string; bib: string; className: string | null }> = [];

  for (const p of items) {
    const name = getName(p);
    const uid = getUid(p);
    const bib = getBib(p);
    if (!name || !uid || !bib) continue;
    if (seen.has(uid)) continue;
    seen.add(uid);
    valid.push({ name, uid, bib, className: getClassName(p) });
  }

  if (valid.length === 0) return { imported: 0, skipped: items.length };

  const normNames = valid.map((v) => normName(v.name));
  const uids = valid.map((v) => v.uid);

  // 2) One query — find athletes that already exist
  const existingAthletes = await prisma.athletes.findMany({
    where: { display_name_norm: { in: normNames } },
    select: { id: true, display_name_norm: true },
  });
  const athleteByNorm = new Map(existingAthletes.map((a) => [a.display_name_norm, a.id]));

  // 3) Bulk-create missing athletes
  const toCreateAthletes = valid
    .filter((v) => !athleteByNorm.has(normName(v.name)))
    .map((v) => ({ display_name: v.name, display_name_norm: normName(v.name) }));

  if (toCreateAthletes.length > 0) {
    await prisma.athletes.createMany({ data: toCreateAthletes, skipDuplicates: true });
    const created = await prisma.athletes.findMany({
      where: { display_name_norm: { in: toCreateAthletes.map((a) => a.display_name_norm) } },
      select: { id: true, display_name_norm: true },
    });
    for (const a of created) athleteByNorm.set(a.display_name_norm, a.id);
  }

  // 4) One query — find identities that already exist
  const existingIdentities = await prisma.athlete_identities.findMany({
    where: { source_id: sourceId, source_person_id: { in: uids } },
    select: { source_person_id: true },
  });
  const existingUids = new Set(existingIdentities.map((i) => i.source_person_id));

  // 5) Bulk-create missing identities
  const newIdentities = valid.flatMap((v) => {
    if (existingUids.has(v.uid)) return [];
    const athleteId = athleteByNorm.get(normName(v.name));
    if (!athleteId) return [];
    return [{ source_id: sourceId, source_person_id: v.uid, athlete_id: athleteId }];
  });

  if (newIdentities.length > 0) {
    await prisma.athlete_identities.createMany({ data: newIdentities, skipDuplicates: true });
  }

  // 6) One query — find startlist entries that already exist
  const bibs = valid.map((v) => v.bib);
  const existingEntries = await prisma.eq_startlist_entries.findMany({
    where: { source_id: sourceId, event_id: eventId, bib: { in: bibs } },
    select: { bib: true },
  });
  const existingBibs = new Set(existingEntries.map((e) => e.bib));

  // 7) Bulk-create new startlist entries, update existing ones
  const newEntries = valid
    .filter((v) => !existingBibs.has(v.bib))
    .map((v) => ({
      source_id: sourceId,
      event_id: eventId,
      bib: v.bib,
      participant_uid: v.uid,
      class_name: v.className,
    }));

  if (newEntries.length > 0) {
    await prisma.eq_startlist_entries.createMany({ data: newEntries, skipDuplicates: true });
  }

  // Update existing entries (uid or className may have changed)
  const toUpdate = valid.filter((v) => existingBibs.has(v.bib));
  if (toUpdate.length > 0) {
    await Promise.all(
      toUpdate.map((v) =>
        prisma.eq_startlist_entries.update({
          where: { source_id_event_id_bib: { source_id: sourceId, event_id: eventId, bib: v.bib } },
          data: { participant_uid: v.uid, class_name: v.className },
        })
      )
    );
  }

  return { imported: valid.length, skipped: items.length - valid.length };
}