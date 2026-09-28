import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

async function getBaseUrl() {
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  if (!host) return "http://localhost:3000";
  return `${proto}://${host}`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventDbId } = await params;
  const body = await req.json().catch(() => ({}));

  const {
    sourceSlug,   // "eqtiming" | "ultimate" | "raceresult"
    // eqtiming
    eq_eventId,
    // ultimate
    ult_eventId,
    ult_distance,
    ult_mode,
    // raceresult
    rr_eventId,
    rr_key,
    rr_listName,
    rr_contest,
    rr_filter,
    // optional overrides (event name, date etc)
    override,
  } = body as {
    sourceSlug: string;
    eq_eventId?: string;
    ult_eventId?: string;
    ult_distance?: string;
    ult_mode?: string;
    rr_eventId?: string;
    rr_key?: string;
    rr_listName?: string;
    rr_contest?: string;
    rr_filter?: string;
    override?: Record<string, unknown>;
  };

  if (!sourceSlug) {
    return NextResponse.json(
      { ok: false, error: "sourceSlug er påkrevd (eqtiming / ultimate / raceresult)" },
      { status: 400 }
    );
  }

  // Verify the event exists
  const event = await prisma.events.findUnique({
    where: { id: eventDbId },
    select: { id: true, name: true, source_event_id: true },
  });
  if (!event) {
    return NextResponse.json({ ok: false, error: "Event ikke funnet" }, { status: 404 });
  }

  // Build the params object for /api/admin/import-run
  let importParams: Record<string, unknown> = {};

  if (sourceSlug === "eqtiming") {
    const eventId = Number(eq_eventId ?? event.source_event_id);
    if (!Number.isFinite(eventId) || eventId <= 0) {
      return NextResponse.json(
        { ok: false, error: "Ugyldig eqtiming eventId" },
        { status: 400 }
      );
    }
    importParams = { eventId };

  } else if (sourceSlug === "ultimate") {
    const eventId = Number(ult_eventId);
    if (!Number.isFinite(eventId) || eventId <= 0) {
      return NextResponse.json(
        { ok: false, error: "Ugyldig ultimate eventId" },
        { status: 400 }
      );
    }
    importParams = {
      mode:     ult_mode ?? "NOR",
      eventId,
      distance: ult_distance ? Number(ult_distance) : null,
    };

  } else if (sourceSlug === "raceresult") {
    const eventId = Number(rr_eventId);
    if (!Number.isFinite(eventId) || eventId <= 0) {
      return NextResponse.json(
        { ok: false, error: "Ugyldig raceresult eventId" },
        { status: 400 }
      );
    }
    if (!rr_key?.trim()) {
      return NextResponse.json(
        { ok: false, error: "raceresult key er påkrevd" },
        { status: 400 }
      );
    }
    importParams = {
      eventId,
      key:      rr_key.trim(),
      listName: rr_listName?.trim() ?? "Online|Final",
      contest:  Number(rr_contest ?? 0),
      filter:   rr_filter?.trim() ?? "",
    };

  } else {
    return NextResponse.json(
      { ok: false, error: `Ukjent sourceSlug: ${sourceSlug}` },
      { status: 400 }
    );
  }

  // Delegate to the existing import-run endpoint
  const baseUrl = await getBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/api/admin/import-run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceSlug,
        params: importParams,
        override: override ?? {},
      }),
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: data?.error ?? data?.message ?? `Import feilet (${res.status})` },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, ...data });

  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Nettverksfeil: ${String(err)}` },
      { status: 502 }
    );
  }
}