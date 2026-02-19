import { prisma } from "@/lib/prisma";

function normName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

type IdentifyInput = {
  sourceSlug: "eqtiming" | "ultimate";
  sourcePersonId: string; // global id hvis mulig, ellers syntetisk id
  displayName: string;
  gender?: string | null;     // "m"/"f" eller null
  birthYear?: number | null;
  club?: string | null;
  payload?: any;
};

export async function resolveAthleteForIdentity(input: IdentifyInput) {
  const source = await prisma.sources.findUnique({ where: { slug: input.sourceSlug } });
  if (!source) throw new Error(`Missing source: ${input.sourceSlug}`);

  // 1) Hvis identity allerede finnes → ferdig
  const existingIdentity = await prisma.athlete_identities.findUnique({
    where: {
      source_id_source_person_id: { source_id: source.id, source_person_id: input.sourcePersonId },
    },
  });

  if (existingIdentity) return { athleteId: existingIdentity.athlete_id, linked: true, created: false };

  // 2) Prøv å finne best match i athletes basert på navn + (year/gender)
  const nameNorm = normName(input.displayName);

  // Kandidater: trigram-likhet på display_name_norm
  // (forutsetter pg_trgm + index du allerede bruker)
  const candidates = await prisma.$queryRaw<
    { id: string; display_name: string; display_name_norm: string; birth_year: number | null; gender: string | null }[]
  >`
    select id, display_name, display_name_norm, birth_year, gender
    from public.athletes
    where display_name_norm % ${nameNorm}
    order by similarity(display_name_norm, ${nameNorm}) desc
    limit 10
  `;

  // Scoring
  let best: { id: string; score: number } | null = null;

  for (const c of candidates) {
    let score = 0;

    // navn likhet (grov): bruk trigram-sim i SQL sort, her legger vi bare basis
    score += 60;

    if (input.birthYear && c.birth_year && input.birthYear === c.birth_year) score += 25;
    if (input.gender && c.gender && input.gender === c.gender) score += 10;

    // klubb er vanskelig (ligger i results), så vi bruker den kun hvis du vil utvide senere

    if (!best || score > best.score) best = { id: c.id, score };
  }

  // 3) Auto-link hvis score høy nok
  if (best && best.score >= 85) {
    await prisma.athlete_identities.create({
      data: { athlete_id: best.id, source_id: source.id, source_person_id: input.sourcePersonId },
    });
    return { athleteId: best.id, linked: true, created: false, auto: true, score: best.score };
  }

  // 4) Hvis vi har noen kandidater men ikke sikre → legg i merge_suggestions
  if (best) {
    await prisma.merge_suggestions.create({
      data: {
        source_slug: input.sourceSlug,
        source_person_id: input.sourcePersonId,
        candidate_athlete_id: best.id,
        score: best.score,
        payload: input.payload ?? null,
      },
    });
  }

  // 5) Ellers: lag ny athlete + link
  const athlete = await prisma.athletes.upsert({
    where: { display_name_norm: nameNorm },
    update: {},
    create: {
      display_name: input.displayName,
      display_name_norm: nameNorm,
      gender: input.gender ?? null,
      birth_year: input.birthYear ?? null,
    },
  });

  await prisma.athlete_identities.create({
    data: { athlete_id: athlete.id, source_id: source.id, source_person_id: input.sourcePersonId },
  });

  return { athleteId: athlete.id, linked: true, created: true };
}