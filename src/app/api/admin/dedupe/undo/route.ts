import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { undoMerge } from "@/lib/dedupe/merge";
import { SEASON_TAG } from "@/lib/season";

export const dynamic = "force-dynamic";

/** Undoes one automatic merge (admin only). The pair is never merged again. */
export async function POST(req: Request) {
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "INVALID_ID" }, { status: 400 });
  const ok = await undoMerge(id);
  if (ok) {
    try {
      revalidateTag(SEASON_TAG, "max");
    } catch {}
  }
  return NextResponse.json({ ok });
}
