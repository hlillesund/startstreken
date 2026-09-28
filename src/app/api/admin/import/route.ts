import { NextRequest, NextResponse } from "next/server";
import { isDistanceCategory } from "@/lib/import/distance";
import { importEvent, previewEvent, saveEventPreset } from "@/lib/import/run";
import { parseEventRef } from "@/lib/import/sources";
import { parseRacedaysRef } from "@/lib/import/sources/racedays";
import { isSourceSlug, type ImportOverride } from "@/lib/import/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = {
  /** URL or numeric id. */
  ref?: string;
  source?: string;
  preview?: boolean;
  ultimateDistance?: string | null;
  nation?: string | null;
  override?: ImportOverride;
  savePreset?: boolean;
};

function cleanOverride(o: ImportOverride | undefined): ImportOverride {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const dist = o?.distance_m === null || o?.distance_m === undefined ? null : Number(o.distance_m);
  return {
    event_name: str(o?.event_name),
    start_date: str(o?.start_date)?.match(/^\d{4}-\d{2}-\d{2}$/) ? str(o?.start_date) : null,
    location: str(o?.location),
    race_name: str(o?.race_name),
    distance_m: dist !== null && Number.isFinite(dist) && dist > 0 ? Math.round(dist) : null,
    distance_category: isDistanceCategory(o?.distance_category) ? o.distance_category : null,
  };
}

/** POST /api/admin/import — preview or import a single event from a URL/id. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const parsed = parseEventRef(String(body.ref ?? ""));
  const source = parsed.source ?? (isSourceSlug(body.source) ? body.source : null);
  // A bare Racedays slug/UUID only makes sense when Racedays was picked as the source.
  const eventId = parsed.eventId ?? (source === "racedays" ? parseRacedaysRef(String(body.ref ?? "")) : null);

  const validId = source === "racedays" ? /^[a-z0-9-]{3,120}$/i : /^\d{1,9}$/;
  if (!eventId || !validId.test(eventId)) {
    return NextResponse.json({ ok: false, error: "Fant ingen gyldig event-ID i lenken" }, { status: 400 });
  }
  if (!source) {
    return NextResponse.json({ ok: false, error: "Velg kilde (kunne ikke gjenkjenne den fra lenken)" }, { status: 400 });
  }

  const options = {
    ultimateDistance: body.ultimateDistance?.toString().trim() || null,
    nation: body.nation?.toString().trim() || null,
  };

  try {
    if (body.preview) {
      const preview = await previewEvent(source, eventId, options);
      return NextResponse.json({ ok: true, preview });
    }

    const override = cleanOverride(body.override);
    if (body.savePreset) await saveEventPreset(source, eventId, override);
    const outcome = await importEvent({ source, sourceEventId: eventId, trigger: "manual", options, override });
    return NextResponse.json({ ok: outcome.status !== "failed", source, eventId, ...outcome });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
