import { PrismaClient } from "@prisma/client";
import { decode } from "html-entities";

const prisma = new PrismaClient();

function needsFix(s: string | null) {
  if (!s) return false;
  return s.includes("&") || s.includes("&#");
}

function fix(s: string | null) {
  if (!s) return s;
  return decode(s);
}

async function mergeAthletes(badId: string, targetId: string) {
  // 1) results: slett duplicates som ville krasje på @@unique([race_id, athlete_id, time_ms])
  await prisma.$executeRawUnsafe(`
    delete from public.results r
    where r.athlete_id = '${badId}'
      and exists (
        select 1
        from public.results r2
        where r2.athlete_id = '${targetId}'
          and r2.race_id = r.race_id
          and r2.time_ms = r.time_ms
      )
  `);

  // 2) flytt resterende results
  await prisma.$executeRawUnsafe(`
    update public.results
    set athlete_id = '${targetId}'
    where athlete_id = '${badId}'
  `);

  // 3) athlete_identities: slett duplicates som ville krasje på @@unique([source_id, source_person_id])
  await prisma.$executeRawUnsafe(`
    delete from public.athlete_identities ai
    where ai.athlete_id = '${badId}'
      and exists (
        select 1
        from public.athlete_identities ai2
        where ai2.athlete_id = '${targetId}'
          and ai2.source_id = ai.source_id
          and ai2.source_person_id = ai.source_person_id
      )
  `);

  // 4) flytt resterende identities
  await prisma.$executeRawUnsafe(`
    update public.athlete_identities
    set athlete_id = '${targetId}'
    where athlete_id = '${badId}'
  `);

  // 5) merge_suggestions (valgfritt, men du har tabellen)
  await prisma.$executeRawUnsafe(`
    update public.merge_suggestions
    set candidate_athlete_id = '${targetId}'
    where candidate_athlete_id = '${badId}'
  `);

  // 6) slett bad athlete
  await prisma.athletes.delete({ where: { id: badId } });
}

async function main() {
  // Hent kandidater
  const candidates = await prisma.athletes.findMany({
    where: {
      OR: [
        { display_name: { contains: "&" } },
        { display_name_norm: { contains: "&" } },
      ],
    },
    select: { id: true, display_name: true, display_name_norm: true },
    take: 50000,
  });

  console.log(`candidates=${candidates.length}`);

  let fixed = 0;
  let merged = 0;
  let skipped = 0;

  for (const a of candidates) {
    const fixedName = fix(a.display_name);
    const fixedNorm = fix(a.display_name_norm);

    const changed = fixedName !== a.display_name || fixedNorm !== a.display_name_norm;
    if (!changed) {
      skipped++;
      continue;
    }

    // finn target med samme fixedNorm
    let target = null as null | { id: string };
    if (fixedNorm) {
      target = await prisma.athletes.findFirst({
        where: { display_name_norm: fixedNorm, NOT: { id: a.id } },
        select: { id: true },
      });
    }

    // hvis fixedNorm kolliderer med annen athlete -> merge
    if (target) {
      await mergeAthletes(a.id, target.id);
      merged++;
      continue;
    }

    // ellers: oppdater bare navn/norm
    // (men sjekk kollisjon for sikkerhet)
    if (fixedNorm) {
      const collision = await prisma.athletes.findFirst({
        where: { display_name_norm: fixedNorm, NOT: { id: a.id } },
        select: { id: true },
      });
      if (collision) {
        await mergeAthletes(a.id, collision.id);
        merged++;
        continue;
      }
    }

    await prisma.athletes.update({
      where: { id: a.id },
      data: {
        display_name: fixedName ?? a.display_name,
        display_name_norm: fixedNorm ?? a.display_name_norm,
      },
    });
    fixed++;
  }

  console.log({ fixed, merged, skipped });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });