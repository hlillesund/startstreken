import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { runDedupe } from "@/lib/dedupe/run";
import { prisma } from "@/lib/prisma";
import { SEASON_TAG } from "@/lib/season";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Weekly, Monday night (see vercel.json); skipped when no profiles were added in the
 * last eight days (?force=1 runs anyway): merges athlete profiles that are clearly the same
 * person under different spellings of the name. ?dry=1 reports without changes.
 * Protected by CRON_SECRET or an admin login (see src/proxy.ts).
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const dryRun = q.get("dry") === "1";
  if (!dryRun && q.get("force") !== "1") {
    const [{ n }] = await prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM athletes WHERE created_at > now() - interval '8 days'`;
    if (n === 0) return NextResponse.json({ ok: true, skipped: "no new athletes this week" });
  }
  const sample = Math.min(500, Math.max(1, Number(q.get("sample")) || 40));
  try {
    const report = await runDedupe({ dryRun, sample, budgetMs: Number(process.env.DEDUPE_BUDGET_MS) || 240_000 });
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
