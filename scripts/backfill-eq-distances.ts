/**
 * Fills in races.distance_m for EQ Timing races imported without a distance, using
 * EQ's own course length ("Km" on each Etappe). The race name only wins when it
 * states a distance that clearly contradicts EQ (e.g. "5000 meter" listed as 65 km).
 * Run scripts/fix-categories.ts afterwards to update the ranking categories.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/backfill-eq-distances.ts            dry run
 *   npx tsx --tsconfig tsconfig.json scripts/backfill-eq-distances.ts --apply    write
 */
import fs from "node:fs";

for (const f of [".env.local", ".env"]) if (fs.existsSync(f)) process.loadEnvFile(f);

type Etappe = { Navn?: string; Km?: number; Seksjon?: boolean };

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("@/lib/prisma");
  const { fetchJson, mapLimit } = await import("@/lib/import/http");
  const { normKey } = await import("@/lib/import/text");
  const { parseDistanceFromText } = await import("@/lib/import/distance");

  const races = await prisma.races.findMany({
    where: { distance_m: null, events: { sources: { slug: "eqtiming" } }, results: { some: {} } },
    select: { id: true, name: true, source_race_id: true, events: { select: { source_event_id: true } } },
  });
  const byEvent = new Map<string, typeof races>();
  for (const r of races) byEvent.set(r.events.source_event_id, [...(byEvent.get(r.events.source_event_id) ?? []), r]);
  console.log(`${races.length} EQ races without a distance in ${byEvent.size} events`);

  let filled = 0;
  let fromName = 0;
  let noInfo = 0;
  let failed = 0;
  const updates: { id: string; m: number }[] = [];
  const examples: string[] = [];

  await mapLimit([...byEvent.keys()], 4, async (eventId) => {
    let stages: Etappe[] = [];
    try {
      const info = await fetchJson<{ Etapper?: Record<string, Etappe> }>(`https://live.eqtiming.com/api/Event/${eventId}`, {
        headers: { "X-Requested-With": "XMLHttpRequest", Referer: `https://live.eqtiming.com/${eventId}` },
        timeoutMs: 30_000,
      });
      stages = Object.values(info.Etapper ?? {});
    } catch {
      failed++;
      return;
    }
    const km = new Map<string, number>();
    for (const s of stages) if (s.Navn && !s.Seksjon && s.Km && s.Km > 0) km.set(normKey(s.Navn), Math.round(s.Km * 1000));

    for (const race of byEvent.get(eventId) ?? []) {
      const eq = km.get(race.source_race_id ?? "") ?? km.get(normKey(race.name));
      const name = parseDistanceFromText(race.name);
      const m = eq && name && Math.abs(eq - name) / name > 0.25 ? name : eq;
      if (!m) {
        noInfo++;
        continue;
      }
      if (m !== eq) fromName++;
      else filled++;
      updates.push({ id: race.id, m });
      if (examples.length < 15 && name && m !== name) examples.push(`${eventId} · ${race.name}: EQ ${eq} m (name suggests ${name} m) → ${m} m`);
    }
  });

  console.log(`from EQ: ${filled}, from name (EQ clearly wrong): ${fromName}, no distance at EQ either: ${noInfo}, fetch failed: ${failed}`);
  if (examples.length) console.log("Where EQ and the name disagree:\n  " + examples.join("\n  "));

  if (apply) {
    for (const u of updates) await prisma.races.update({ where: { id: u.id }, data: { distance_m: u.m } });
    console.log(`Updated ${updates.length} races.`);
  } else {
    console.log("Dry run — nothing changed. Re-run with --apply to write.");
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
