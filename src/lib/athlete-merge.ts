import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

function normName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

type IdentifyInput = {
  sourceSlug: "eqtiming" | "ultimate";
  sourcePersonId: string; // global id hvis mulig, ellers syntetisk id
  displayName: string;
  gender?: string | null; // "m"/"f" eller null
  birthYear?: number | null;
  club?: string | null;
  payload?: any;
};

export async function resolveAthleteForIdentity(input: IdentifyInput) {
  const sourceRow = await prisma.sources.findUnique({
    where: { slug: input.sourceSlug },
  });
  if (!sourceRow) throw new Error(`Missing source: ${input.sourceSlug}`);
  const source = sourceRow;

  // Helper: lag identity uten å kunne kræsje på unique (race condition)
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

  // 2) Prøv å finne best match i athletes basert på navn + (year/gender)
  const nameNorm = normName(input.displayName);

  const candidates = await prisma.$queryRaw<
    {
      id: string;
      display_name: string;
      display_name_norm: string;
      birth_year: number | null;
      gender: string | null;
    }[]
  >`
    select id, display_name, display_name_norm, birth_year, gender
    from public.athletes
    where display_name_norm % ${nameNorm}
    order by similarity(display_name_norm, ${nameNorm}) desc
    limit 10
  `;

  // Scoring (enkel, men funker)
  let best: { id: string; score: number } | null = null;

  for (const c of candidates) {
    let score = 0;

    // navn likhet (SQL sort gir allerede "best først")
    score += 60;

    if (input.birthYear && c.birth_year && input.birthYear === c.birth_year) score += 25;
    if (input.gender && c.gender && input.gender === c.gender) score += 10;

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
  // Viktig: upsert kan kaste P2002 under race conditions -> fallback til findUnique.
  let athlete: { id: string };

  try {
    athlete = await prisma.athletes.upsert({
      where: { display_name_norm: nameNorm },
      update: {}, // no-op
      create: {
        display_name: input.displayName,
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