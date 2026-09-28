import { NextRequest, NextResponse } from "next/server";
import { processQueue, runCrawl } from "@/lib/import/crawler";
import { isSourceSlug, type SourceSlug } from "@/lib/import/types";
import { latestUltimateId, scanUltimate } from "@/lib/import/ultimate-scan";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = {
  /**
   * crawl = discover + import, discover = only find events, process = only import due items,
   * ultimate-scan = walk Ultimate event ids looking for older Norwegian events.
   */
  mode?: "crawl" | "discover" | "process" | "ultimate-scan" | "ultimate-latest";
  fromId?: number;
  toId?: number | null;
  minNorwegians?: number;
  from?: string;
  to?: string;
  sources?: string[];
  budgetMs?: number;
};

const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** POST /api/admin/crawl — the "Crawl nå" / backfill / "Prosesser kø" buttons. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const mode = body.mode ?? "crawl";
  const budgetMs = Math.min(Math.max(Number(body.budgetMs) || 50_000, 0), 270_000);
  const sources = (body.sources ?? []).filter(isSourceSlug) as SourceSlug[];

  if ((body.from && !isDate(body.from)) || (body.to && !isDate(body.to))) {
    return NextResponse.json({ ok: false, error: "Datoer må være på formatet YYYY-MM-DD" }, { status: 400 });
  }
  if (body.from && body.to && body.from > body.to) {
    return NextResponse.json({ ok: false, error: "Fra-dato er etter til-dato" }, { status: 400 });
  }

  try {
    if (mode === "ultimate-latest") {
      return NextResponse.json({ ok: true, latestId: await latestUltimateId() });
    }
    if (mode === "ultimate-scan") {
      const fromId = Number(body.fromId);
      const toId = body.toId ? Number(body.toId) : null;
      if (!Number.isInteger(fromId) || fromId < 1 || (toId !== null && (!Number.isInteger(toId) || toId < fromId))) {
        return NextResponse.json({ ok: false, error: "Ugyldig ID-område" }, { status: 400 });
      }
      const scan = await scanUltimate({
        fromId,
        toId,
        minNorwegians: Number(body.minNorwegians) || 15,
        budgetMs: Math.min(budgetMs, 60_000),
      });
      return NextResponse.json({ ok: true, scan });
    }
    if (mode === "process") {
      const processing = await processQueue({ budgetMs, trigger: "queue" });
      return NextResponse.json({ ok: true, processing });
    }
    const result = await runCrawl({
      trigger: body.from ? "backfill" : "manual",
      discover: { from: body.from, to: body.to, sources: sources.length ? sources : undefined },
      budgetMs: mode === "discover" ? 0 : budgetMs,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
