// Merging two athlete profiles, with a log that makes every merge undoable.
import { prisma } from "@/lib/prisma";

let ready: Promise<void> | null = null;

/**
 * Creates the dedupe tables on first use (the schema is managed by hand in
 * Supabase, so this keeps deploys free of manual steps).
 *   athlete_aliases: other spellings of a name → athlete, used by the importers
 *   athlete_merges:  what each merge moved, so it can be undone
 */
export function ensureDedupeTables() {
  ready ??= (async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public.athlete_aliases (
        name_norm  text PRIMARY KEY,
        athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS athlete_aliases_athlete_idx ON public.athlete_aliases (athlete_id)`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public.athlete_merges (
        id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        kept_id            uuid NOT NULL,
        removed_id         uuid NOT NULL,
        kept_name_before   text NOT NULL,
        kept_norm_before   text NOT NULL,
        removed_name       text NOT NULL,
        removed_norm       text NOT NULL,
        removed_gender     text,
        removed_birth_year int,
        kept_gender_before text,
        kept_birth_before  int,
        kind               text NOT NULL,
        reasons            jsonb NOT NULL DEFAULT '[]',
        result_ids         uuid[] NOT NULL DEFAULT '{}',
        identity_ids       uuid[] NOT NULL DEFAULT '{}',
        status             text NOT NULL DEFAULT 'merged',
        created_at         timestamptz NOT NULL DEFAULT now()
      )`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS athlete_merges_removed_idx ON public.athlete_merges (removed_id)`);
    // pairs that must never be merged again (an undone merge)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public.athlete_not_same (
        a uuid NOT NULL,
        b uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (a, b)
      )`);
    // Supabase exposes the public schema over its REST API; with RLS on and no
    // policies, only the server's own connection (the table owner) can use these.
    const open = await prisma.$queryRaw<{ relname: string }[]>`
      SELECT relname FROM pg_class
      WHERE relnamespace = 'public'::regnamespace AND NOT relrowsecurity
        AND relname IN ('athlete_aliases', 'athlete_merges', 'athlete_not_same')`;
    for (const { relname } of open) {
      await prisma.$executeRawUnsafe(`ALTER TABLE public.${relname} ENABLE ROW LEVEL SECURITY`);
    }
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

type Athlete = { id: string; display_name: string; display_name_norm: string; gender: string | null; birth_year: number | null };

export type MergeInput = {
  keptId: string;
  removedId: string;
  /** Display name and key the kept profile should end up with. */
  name: string;
  norm: string;
  kind: string;
  reasons: string[];
};

/** Moves everything from `removedId` to `keptId` and deletes it. Returns false if either is gone. */
export async function mergeAthletes(m: MergeInput): Promise<boolean> {
  await ensureDedupeTables();
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Athlete[]>`
      SELECT id::text, display_name, display_name_norm, gender, birth_year
      FROM athletes WHERE id IN (${m.keptId}::uuid, ${m.removedId}::uuid)
      FOR UPDATE`;
    const kept = rows.find((r) => r.id === m.keptId);
    const removed = rows.find((r) => r.id === m.removedId);
    if (!kept || !removed) return false;

    const results = await tx.$queryRaw<{ id: string }[]>`
      UPDATE results SET athlete_id = ${m.keptId}::uuid WHERE athlete_id = ${m.removedId}::uuid RETURNING id::text`;
    const identities = await tx.$queryRaw<{ id: string }[]>`
      UPDATE athlete_identities SET athlete_id = ${m.keptId}::uuid WHERE athlete_id = ${m.removedId}::uuid RETURNING id::text`;
    await tx.$executeRaw`UPDATE merge_suggestions SET candidate_athlete_id = ${m.keptId}::uuid WHERE candidate_athlete_id = ${m.removedId}::uuid`;
    await tx.$executeRaw`UPDATE athlete_aliases SET athlete_id = ${m.keptId}::uuid WHERE athlete_id = ${m.removedId}::uuid`;

    await tx.$executeRaw`
      INSERT INTO athlete_merges (kept_id, removed_id, kept_name_before, kept_norm_before, removed_name, removed_norm,
        removed_gender, removed_birth_year, kept_gender_before, kept_birth_before, kind, reasons, result_ids, identity_ids)
      VALUES (${m.keptId}::uuid, ${m.removedId}::uuid, ${kept.display_name}, ${kept.display_name_norm}, ${removed.display_name},
        ${removed.display_name_norm}, ${removed.gender}, ${removed.birth_year}, ${kept.gender}, ${kept.birth_year}, ${m.kind},
        ${JSON.stringify(m.reasons)}::jsonb, ${results.map((r) => r.id)}::uuid[], ${identities.map((r) => r.id)}::uuid[])`;

    await tx.$executeRaw`DELETE FROM athletes WHERE id = ${m.removedId}::uuid`;
    await tx.$executeRaw`
      UPDATE athletes
      SET display_name = ${m.name},
          display_name_norm = ${m.norm},
          gender = COALESCE(gender, ${removed.gender}),
          birth_year = COALESCE(birth_year, ${removed.birth_year}::int)
      WHERE id = ${m.keptId}::uuid`;

    // both spellings keep pointing here for future imports
    for (const norm of new Set([kept.display_name_norm, removed.display_name_norm])) {
      if (norm === m.norm) continue;
      await tx.$executeRaw`
        INSERT INTO athlete_aliases (name_norm, athlete_id) VALUES (${norm}, ${m.keptId}::uuid)
        ON CONFLICT (name_norm) DO UPDATE SET athlete_id = EXCLUDED.athlete_id`;
    }
    await tx.$executeRaw`DELETE FROM athlete_aliases WHERE name_norm = ${m.norm}`;
    return true;
  }, { timeout: 60_000, maxWait: 15_000 });
}

/** Reverses a merge: brings the removed profile back with its own results. */
export async function undoMerge(mergeId: string): Promise<boolean> {
  await ensureDedupeTables();
  return prisma.$transaction(async (tx) => {
    const [m] = await tx.$queryRaw<{
      kept_id: string; removed_id: string; kept_name_before: string; kept_norm_before: string; removed_name: string; removed_norm: string;
      removed_gender: string | null; removed_birth_year: number | null; kept_gender_before: string | null; kept_birth_before: number | null;
      result_ids: string[]; identity_ids: string[]; status: string;
    }[]>`SELECT kept_id::text, removed_id::text, kept_name_before, kept_norm_before, removed_name, removed_norm, removed_gender,
           removed_birth_year, kept_gender_before, kept_birth_before, result_ids::text[], identity_ids::text[], status
         FROM athlete_merges WHERE id = ${mergeId}::uuid FOR UPDATE`;
    if (!m || m.status !== "merged") return false;

    await tx.$executeRaw`DELETE FROM athlete_aliases WHERE name_norm IN (${m.removed_norm}, ${m.kept_norm_before})`;
    await tx.$executeRaw`
      UPDATE athletes SET display_name = ${m.kept_name_before}, display_name_norm = ${m.kept_norm_before},
        gender = ${m.kept_gender_before}, birth_year = ${m.kept_birth_before}::int
      WHERE id = ${m.kept_id}::uuid`;
    await tx.$executeRaw`
      INSERT INTO athletes (id, display_name, display_name_norm, gender, birth_year)
      VALUES (${m.removed_id}::uuid, ${m.removed_name}, ${m.removed_norm}, ${m.removed_gender}, ${m.removed_birth_year}::int)`;
    await tx.$executeRaw`UPDATE results SET athlete_id = ${m.removed_id}::uuid WHERE id = ANY(${m.result_ids}::uuid[])`;
    await tx.$executeRaw`UPDATE athlete_identities SET athlete_id = ${m.removed_id}::uuid WHERE id = ANY(${m.identity_ids}::uuid[])`;
    await tx.$executeRaw`UPDATE athlete_merges SET status = 'undone' WHERE id = ${mergeId}::uuid`;
    await tx.$executeRaw`
      INSERT INTO athlete_not_same (a, b) VALUES (LEAST(${m.kept_id}::uuid, ${m.removed_id}::uuid), GREATEST(${m.kept_id}::uuid, ${m.removed_id}::uuid))
      ON CONFLICT DO NOTHING`;
    return true;
  }, { timeout: 60_000, maxWait: 15_000 });
}

/** Where a merged-away profile went (old links keep working). */
export async function mergedInto(id: string): Promise<string | null> {
  try {
    await ensureDedupeTables();
    let cur = id;
    for (let i = 0; i < 5; i++) {
      const [row] = await prisma.$queryRaw<{ kept_id: string }[]>`
        SELECT kept_id::text FROM athlete_merges WHERE removed_id = ${cur}::uuid AND status = 'merged' ORDER BY created_at DESC LIMIT 1`;
      if (!row) return cur === id ? null : cur;
      cur = row.kept_id;
    }
    return cur;
  } catch {
    return null;
  }
}
