/**
 * Re-checks results.distance_category with the current classifier and fixes the
 * ones that are provably wrong — typically left behind by the old importers
 * ("10.5 km" filed as 5K, relays and cycling filed as road distances).
 *
 * A category is only changed on positive evidence:
 *   • relay / trail / cross-country / uphill wording in the race or event name → OTHER
 *   • track / indoor races (see isTrack) → OTHER
 *   • a known distance (races.distance_m or one in the race name) → that distance's category
 *   • a time faster than the world record for the category → OTHER
 * Races with an admin override or an import preset are left alone. Missing
 * information never changes anything.
 *
 * Also removes per-athlete EQ history results from non-running federations
 * (skiing, cycling, orienteering…).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/fix-categories.ts            dry run
 *   npx tsx --tsconfig tsconfig.json scripts/fix-categories.ts --apply    write changes
 */
import fs from "node:fs";

for (const f of [".env.local", ".env"]) if (fs.existsSync(f)) process.loadEnvFile(f);

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("@/lib/prisma");
  const { categoryFromMeters, isDistanceCategory, isNonRoad, isTrack, parseDistanceFromText, sanitizeCategory } = await import(
    "@/lib/import/distance"
  );
  const { NON_RUNNING_FEDERATION_SQL } = await import("@/lib/import/relevance");
  type Cat = import("@/lib/import/distance").DistanceCategory;

  // 1) Non-running history results
  const [{ n: nonRunning }] = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM public.results
    WHERE raw ? 'ArrangementUID' AND (raw->'Forbund'->>'Navn') ~* ${NON_RUNNING_FEDERATION_SQL}`;
  console.log(`Non-running EQ history results (skiing, cycling…): ${nonRunning}`);
  if (apply && nonRunning) {
    const deleted = await prisma.$executeRaw`
      DELETE FROM public.results
      WHERE raw ? 'ArrangementUID' AND (raw->'Forbund'->>'Navn') ~* ${NON_RUNNING_FEDERATION_SQL}`;
    console.log(`  deleted ${deleted}`);
  }

  // 2) Categories
  const races = await prisma.races.findMany({
    select: {
      id: true,
      name: true,
      distance_m: true,
      distance_category_override: true,
      source_race_id: true,
      events: { select: { name: true, source_event_id: true, source_id: true } },
    },
  });
  const presets = await prisma.import_presets.findMany({
    where: { distance_category: { not: null } },
    select: { source_id: true, source_event_id: true, source_race_id: true },
  });
  const hasPreset = (sid: string, ev: string, race: string | null) =>
    presets.some((p) => p.source_id === sid && p.source_event_id === ev && (!p.source_race_id || p.source_race_id === race));

  const changes = new Map<string, { n: number; examples: string[] }>();
  const updates = new Map<Cat, string[]>(); // category → result ids
  let checked = 0;

  for (let i = 0; i < races.length; i += 500) {
    const batch = races.slice(i, i + 500).filter(
      (r) => !isDistanceCategory(r.distance_category_override) && !hasPreset(r.events.source_id, r.events.source_event_id, r.source_race_id)
    );
    const rows = await prisma.results.findMany({
      where: { race_id: { in: batch.map((r) => r.id) } },
      select: { id: true, race_id: true, time_ms: true, distance_category: true, raw: true },
    });
    const byRace = new Map<string, typeof rows>();
    for (const r of rows) byRace.set(r.race_id, [...(byRace.get(r.race_id) ?? []), r]);

    for (const race of batch) {
      for (const x of byRace.get(race.id) ?? []) {
        checked++;
        const current = (isDistanceCategory(x.distance_category) ? x.distance_category : "OTHER") as Cat;
        const raw = (x.raw ?? {}) as { EtappeNavn?: string; para?: boolean };
        if (raw.para) continue; // para results are deliberately kept out of the rankings
        const stage = raw.EtappeNavn ?? "";
        const dist = race.distance_m || parseDistanceFromText(race.name) || parseDistanceFromText(stage);

        let want: Cat = current;
        if (isNonRoad(race.name) || isNonRoad(race.events.name, "event") || isNonRoad(stage) || isTrack(race.events.name, race.name)) {
          want = "OTHER";
        }
        else if (dist) want = categoryFromMeters(dist) ?? current;
        want = sanitizeCategory(want, x.time_ms);
        if (want === current) continue;

        const key = `${current} → ${want}`;
        const c = changes.get(key) ?? { n: 0, examples: [] };
        c.n++;
        if (c.examples.length < 6) c.examples.push(`${race.events.name} · ${race.name} · ${Math.round(x.time_ms / 1000)}s`);
        changes.set(key, c);
        updates.set(want, [...(updates.get(want) ?? []), x.id]);
      }
    }
  }

  const total = [...changes.values()].reduce((n, c) => n + c.n, 0);
  console.log(`\nChecked ${checked} results; ${total} categories are provably wrong:`);
  for (const [k, c] of [...changes.entries()].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${k.padEnd(14)} ${String(c.n).padStart(6)}   e.g. ${c.examples.slice(0, 3).join(" | ")}`);
  }

  if (apply) {
    for (const [cat, ids] of updates) {
      for (let i = 0; i < ids.length; i += 5000) {
        await prisma.results.updateMany({ where: { id: { in: ids.slice(i, i + 5000) } }, data: { distance_category: cat } });
      }
    }
    console.log(`\nApplied ${total} category changes.`);
  } else {
    console.log("\nDry run — nothing changed. Re-run with --apply to write.");
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
