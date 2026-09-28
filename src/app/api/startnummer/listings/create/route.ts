import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

type Body = {
  type: "sell" | "buy";
  event: string;
  distance: string;   // "HM", "10K", ...
  date?: string;      // "YYYY-MM-DD"
  price: number;
  bib?: string | null;
  contact?: string;
  reason?: string;
  urgent?: boolean;
};

function parseDateOnly(s?: string) {
  if (!s) return null;
  // expect YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T00:00:00.000Z`);
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const body = (await req.json()) as Body;

  if (!body.type || (body.type !== "sell" && body.type !== "buy")) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
  if (!body.event?.trim()) return NextResponse.json({ error: "Missing event" }, { status: 400 });
  if (!body.distance?.trim()) return NextResponse.json({ error: "Missing distance" }, { status: 400 });
  if (!Number.isFinite(body.price)) return NextResponse.json({ error: "Missing price" }, { status: 400 });

  const raceDate = parseDateOnly(body.date);

  const row = await prisma.bib_listings.create({
    data: {
      type: body.type,
      event: body.event.trim(),
      distance: body.distance.trim(),
      race_date: raceDate,
      price: Math.max(0, Math.round(body.price)),
      bib: body.bib?.trim() ? body.bib.trim() : null,
      contact: body.contact?.trim() ? body.contact.trim() : null,
      reason: body.reason?.trim() ? body.reason.trim() : null,
      urgent: !!body.urgent,
      status: "active",
      seller_user_id: user.id,
    },
    include: { users: true },
  });

  return NextResponse.json({
    id: row.id,
    type: row.type,
    bib: row.bib ?? null,
    event: row.event,
    distance: row.distance,
    date: row.race_date ? row.race_date.toISOString().slice(0, 10) : null,
    price: row.price,
    seller: row.users.display_name ?? `Strava ${row.users.strava_athlete_id.toString()}`,
        seller_has_activity: !!row.users.strava_has_activity,
    posted: row.created_at.toISOString(),
    reason: row.reason ?? "",
    urgent: row.urgent,
    isNew: true,
  });
}