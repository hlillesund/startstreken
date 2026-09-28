import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { importEvent } from "@/lib/import/run";
import { isSourceSlug } from "@/lib/import/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/admin/events/:id/reimport — fetches the event again from the timing
 * system it came from and replaces its results. Admin edits to the event and its
 * races (names, date, distance overrides) are kept.
 *
 * Body (optional, Ultimate only): { ultimateDistance?: string, nation?: string }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { ultimateDistance?: string; nation?: string };

  const event = await prisma.events.findUnique({
    where: { id },
    select: { source_event_id: true, sources: { select: { slug: true } } },
  });
  if (!event) return NextResponse.json({ ok: false, error: "Event ikke funnet" }, { status: 404 });

  const source = event.sources.slug;
  if (!isSourceSlug(source)) {
    return NextResponse.json({ ok: false, error: `Kilden «${source}» støttes ikke for reimport` }, { status: 400 });
  }

  const outcome = await importEvent({
    source,
    sourceEventId: event.source_event_id,
    trigger: "reimport",
    options: {
      ultimateDistance: body.ultimateDistance?.trim() || null,
      nation: body.nation?.trim() || null,
    },
  });

  if (outcome.status === "imported") {
    return NextResponse.json({
      ok: true,
      inserted: outcome.summary.results,
      races: outcome.summary.races,
      athletes: outcome.summary.athletes,
      warnings: outcome.summary.warnings,
      durationMs: outcome.durationMs,
    });
  }
  const error = outcome.status === "no_results" ? outcome.message : outcome.error;
  return NextResponse.json({ ok: false, error }, { status: outcome.status === "no_results" ? 200 : 502 });
}
