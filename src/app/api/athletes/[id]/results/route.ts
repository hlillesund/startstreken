import { NextRequest, NextResponse } from "next/server";
import { getAthleteResults } from "@/lib/athlete-results";

export const dynamic = "force-dynamic";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json([]);

  try {
    return NextResponse.json(await getAthleteResults(id));
  } catch (err) {
    console.error("[athlete results] error:", err);
    return NextResponse.json({ error: "RESULTS_FAILED" }, { status: 500 });
  }
}
