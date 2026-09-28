/**
 * Import pipeline from the command line — no serverless time limit, so this is
 * the tool for big backfills.
 *
 *   npm run crawl                                   discover the last 10 days, then import the whole queue
 *   npm run crawl -- --from 2025-01-01 --to 2025-12-31 [--sources eqtiming,raceresult]
 *   npm run crawl -- --process                      only import what's already queued
 *   npm run crawl -- --discover                     only discover (don't import)
 *   npm run crawl -- --import eqtiming:80410        import one event
 *   npm run crawl -- --preview raceresult:258952    parse one event and print it, without touching the DB
 *   npm run crawl -- --scan-ultimate 5000-          find older Norwegian Ultimate events (id range, [--min 15])
 *
 * Reads DATABASE_URL from .env.local / .env.
 */
import fs from "node:fs";

for (const f of [".env.local", ".env"]) if (fs.existsSync(f)) process.loadEnvFile(f);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? "") : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function parseRef(ref: string | undefined) {
  const [source, id] = (ref ?? "").split(":");
  if (!source || !/^[a-z0-9-]+$/i.test(id ?? "")) throw new Error(`Expected <source>:<eventId>, e.g. eqtiming:80410 — got "${ref}"`);
  return { source, id };
}

async function main() {
  const { CRAWL_SOURCES, isSourceSlug } = await import("@/lib/import/types");

  const previewRef = arg("preview");
  if (previewRef !== undefined) {
    const { source, id } = parseRef(previewRef);
    if (!isSourceSlug(source)) throw new Error(`Unknown source ${source}`);
    const { previewEvent } = await import("@/lib/import/run");
    const p = await previewEvent(source, id);
    console.log(`${p.name} · ${p.date} · ${p.location ?? ""}`);
    for (const r of p.races) console.log(`  ${r.name.padEnd(40)} ${String(r.distanceM ?? "—").padStart(7)} m  ${r.category.padEnd(5)} ${r.finishers} finishers`);
    for (const w of p.warnings) console.log(`  ⚠ ${w}`);
    return;
  }

  const { prisma } = await import("@/lib/prisma");
  try {
    const importRef = arg("import");
    if (importRef !== undefined) {
      const { source, id } = parseRef(importRef);
      if (!isSourceSlug(source)) throw new Error(`Unknown source ${source}`);
      const { importEvent } = await import("@/lib/import/run");
      const out = await importEvent({ source, sourceEventId: id, trigger: "cli" });
      console.log(JSON.stringify(out, null, 2));
      return;
    }

    const scanRange = arg("scan-ultimate");
    if (scanRange !== undefined) {
      const [from, to] = scanRange.split("-").map((x) => (x ? Number(x) : null));
      if (!from) throw new Error('Expected --scan-ultimate <fromId>-[toId], e.g. "5000-8100" or "5000-"');
      const { scanUltimate } = await import("@/lib/import/ultimate-scan");
      let fromId: number | null = from;
      let total = 0;
      while (fromId) {
        const s = await scanUltimate({ fromId, toId: to, minNorwegians: Number(arg("min")) || 15, budgetMs: 5 * 60_000 });
        for (const f of s.found) console.log(`  + #${f.id} ${f.name} — ${f.norwegians} Norwegians, ~${f.date} (${f.dateSource})`);
        total += s.found.length;
        console.log(`Scanned to #${s.scannedTo} of ${s.toId}`);
        fromId = s.nextId;
      }
      console.log(`Done. ${total} candidates queued under "Må vurderes".`);
      return;
    }

    const { runDiscovery, processQueue } = await import("@/lib/import/crawler");
    const { addDays, isoDate, osloToday, toDateOnly } = await import("@/lib/import/text");

    if (!flag("process")) {
      const to = arg("to") ?? osloToday();
      const from = arg("from") ?? isoDate(addDays(toDateOnly(to)!, -10))!;
      const sources = (arg("sources")?.split(",") ?? [...CRAWL_SOURCES]).filter(isSourceSlug);
      console.log(`Discovering ${from} → ${to} (${sources.join(", ")})…`);
      const stats = await runDiscovery({ from, to, sources });
      for (const [s, st] of Object.entries(stats)) {
        console.log(`  ${s}: ${st.error ? `ERROR ${st.error}` : `${st.found} found, ${st.added} new, ${st.alreadyImported} already imported`}`);
      }
    }
    if (flag("discover")) return;

    console.log("Importing queue…");
    let total = 0;
    for (;;) {
      const p = await processQueue({ budgetMs: 10 * 60_000, trigger: "cli" });
      for (const it of p.items) {
        const tag = it.status === "imported" ? `✓ ${it.results} results` : it.status === "no_results" ? "… no results yet" : `✗ ${it.error}`;
        console.log(`  ${it.source}:${it.id} ${it.name ?? ""} — ${tag}`);
      }
      total += p.results;
      if (p.processed === 0 || p.remaining === 0) {
        console.log(`Done. ${total} results imported, ${p.remaining} items still due (waiting/retry).`);
        break;
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
