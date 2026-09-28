import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
function isoDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  const rows = await prisma.bib_listings.findMany({
    where: { status: "active" },
    orderBy: { created_at: "desc" },
    include: { users: true }, // relation from bib_listings -> public_users (Prisma will name it "users" typically)
  });

   const listings = rows.map((r) => ({
    id: r.id,
    type: r.type,
    bib: r.bib ?? null,
    event: r.event,
    distance: r.distance,
    date: r.race_date ? isoDateOnly(r.race_date) : null,
    price: r.price,
    seller: r.users.display_name ?? `Strava ${r.users.strava_athlete_id.toString()}`,
    seller_has_activity: !!r.users.strava_has_activity, // <- NEW
    posted: r.created_at.toISOString(),
    reason: r.reason ?? "",
    urgent: r.urgent,
    isNew: false,
  }));

  return NextResponse.json(listings);
}