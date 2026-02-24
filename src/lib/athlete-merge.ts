import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const SOURCE_SLUGS = ["eqtiming", "ultimate", "raceresult"] as const;
type SourceSlug = (typeof SOURCE_SLUGS)[number];

type IdentifyInput = {
  sourceSlug: SourceSlug;
  sourcePersonId: string;
  displayName: string;
  gender?: string | null; // "m"/"f" eller null
  birthYear?: number | null;
  club?: string | null;
  payload?: any;
};

function canonicalizeName(name: string) {
  let s = (name ?? "").trim();

  // "Last, First Middle" -> "First Middle Last"
  const m = s.match(/^([^,]+),\s*(.+)$/);
  if (m) {
    const last = m[1].trim();
    const first = m[2].trim();
    s = `${first} ${last}`.trim();
  }

  // fjern tegnsetting som varierer mellom kilder
  s = s.replace(/[.,]/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

function normName(name: string) {
  return canonicalizeName(name).toLowerCase().replace(/\s+/g, " ").trim();
}

export async function resolveAthleteForIdentity(input: IdentifyInput) {
  const sourceRow = await prisma.sources.findUnique({
    where: { slug: input.sourceSlug },
  });
  if (!sourceRow) throw new Error(`Missing source: ${input.sourceSlug}`);
  const source = sourceRow;

  const displayNameCanon = canonicalizeName(input.displayName);
  const nameNorm = normName(displayNameCanon);

  async function upsertIdentity(athleteId: string) {
    await prisma.athlete_identities.upsert({
      where: {
        source_id_source_person_id: {
          source_id: source.id,
          source_person_id: input.sourcePersonId,
        },
      },
      update: { athlete_id: athleteId },
      create: {
        athlete_id: athleteId,
        source_id: source.id,
        source_person_id: input.sourcePersonId,
      },
    });
  }

  // 1) Hvis identity allerede finnes → ferdig
  const existingIdentity = await prisma.athlete_identities.findUnique({
    where: {
      source_id_source_person_id: {
        source_id: source.id,
        source_person_id: input.sourcePersonId,
      },
    },
    select: { athlete_id: true },
  });

  if (existingIdentity) {
    return { athleteId: existingIdentity.athlete_id, linked: true, created: false };
  }

  // 2) Finn kandidater basert på trigram + similarity (bruk faktisk sim)
  const candidates = await prisma.$queryRaw<
    {
      id: string;
      birth_year: number | null;
      gender: string | null;
      sim: number;
    }[]
  >`
    select
      id,
      birth_year,
      gender,
      similarity(display_name_norm, ${nameNorm}) as sim
    from public.athletes
    where display_name_norm % ${nameNorm}
    order by sim desc
    limit 10
  `;

  let best: { id: string; score: number } | null = null;

  for (const c of candidates) {
    let score = Math.round((c.sim ?? 0) * 100);
    if (input.birthYear && c.birth_year && input.birthYear === c.birth_year) score += 15;
    if (input.gender && c.gender && input.gender === c.gender) score += 5;

    if (!best || score > best.score) best = { id: c.id, score };
  }

  // 3) Auto-link hvis score høy nok
  if (best && best.score >= 85) {
    await upsertIdentity(best.id);
    return { athleteId: best.id, linked: true, created: false, auto: true, score: best.score };
  }

  // 4) Kandidat men ikke sikker → merge_suggestions (best-effort)
  if (best) {
    try {
      await prisma.merge_suggestions.create({
        data: {
          source_slug: input.sourceSlug,
          source_person_id: input.sourcePersonId,
          candidate_athlete_id: best.id,
          score: best.score,
          payload: input.payload ?? null,
        },
      });
    } catch {
      // ignore duplicates
    }
  }

  // 5) Lag (eller finn) athlete basert på display_name_norm.
  let athlete: { id: string };

  try {
    athlete = await prisma.athletes.upsert({
      where: { display_name_norm: nameNorm },
      update: {
        // hvis vi får bedre data senere, kan vi oppdatere litt
        gender: input.gender ?? undefined,
        birth_year: input.birthYear ?? undefined,
        // og sørg for at display_name blir kanonisk (uten komma)
        display_name: displayNameCanon,
      },
      create: {
        display_name: displayNameCanon, // ✅ lagrer pen kanonisk
        display_name_norm: nameNorm,
        gender: input.gender ?? null,
        birth_year: input.birthYear ?? null,
      },
      select: { id: true },
    });
  } catch (e: any) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await prisma.athletes.findUnique({
        where: { display_name_norm: nameNorm },
        select: { id: true },
      });
      if (!existing) throw e;
      athlete = existing;
    } else {
      throw e;
    }
  }

  await upsertIdentity(athlete.id);
  return { athleteId: athlete.id, linked: true, created: true };
}