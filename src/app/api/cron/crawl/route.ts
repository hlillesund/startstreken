import { NextResponse } from "next/server";
import { runCrawl } from "@/lib/import/crawler";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * Daily crawl (see vercel.json): discovers new events from the last days at every
 * source and imports whatever is due within the time budget. Leftovers are picked
 * up by the next run. Protected by CRON_SECRET (see src/proxy.ts).
 */
export async function GET() {
  // kept short: function time is what the Vercel plan pays for; leftovers wait for the next night
  const budgetMs = Number(process.env.CRAWL_BUDGET_MS) || 120_000;
  const lookbackDays = Number(process.env.CRAWL_LOOKBACK_DAYS) || 4;
  try {
    const result = await runCrawl({ trigger: "cron", budgetMs, lookbackDays });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
