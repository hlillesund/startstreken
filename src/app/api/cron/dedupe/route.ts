import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { runDedupe } from "@/lib/dedupe/run";
import { SEASON_TAG } from "@/lib/season";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily (see vercel.json): merges athlete profiles that are clearly the same
 * person under different spellings of the name. ?dry=1 reports without changes.
 * Protected by CRON_SECRET or an admin login (see src/proxy.ts).
 */
export async function GET(req: Request) {
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  try {
    const report = await runDedupe({ dryRun, budgetMs: Number(process.env.DEDUPE_BUDGET_MS) || 240_000 });
    if (report.merged > 0) {
      try {
        revalidateTag(SEASON_TAG, "max");
      } catch {
        // refreshed within the cache lifetime anyway
      }
    }
    return NextResponse.json({ ok: true, ...report });
  } catch (e) {
    console.error("[dedupe] failed:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
