import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** GET /api/admin/import-runs — the latest imports, newest first. */
export async function GET() {
  const runs = await prisma.import_runs.findMany({
    orderBy: { started_at: "desc" },
    take: 60,
    include: { sources: { select: { slug: true } } },
  });
  const crawls = await prisma.crawl_runs.findMany({ orderBy: { started_at: "desc" }, take: 15 });
  return NextResponse.json({
    runs: runs.map(({ sources, ...r }) => ({ ...r, source_slug: sources.slug })),
    crawls,
  });
}
