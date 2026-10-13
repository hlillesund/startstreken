import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureDedupeTables } from "@/lib/dedupe/merge";

export const dynamic = "force-dynamic";

/** The latest automatic merges (admin only), e.g. to find one to undo. */
export async function GET(req: Request) {
  const limit = Math.min(500, Number(new URL(req.url).searchParams.get("limit")) || 100);
  await ensureDedupeTables();
  const merges = await prisma.$queryRaw<unknown[]>`
    SELECT m.id::text, m.created_at, m.status, m.kind, m.reasons, m.removed_name, m.kept_name_before,
           a.display_name AS kept_name, m.kept_id::text, m.removed_id::text, cardinality(m.result_ids) AS results_moved
    FROM athlete_merges m LEFT JOIN athletes a ON a.id = m.kept_id
    ORDER BY m.created_at DESC
    LIMIT ${limit}`;
  return NextResponse.json({ ok: true, merges });
}
