import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;

  const query = url.searchParams.get("q");
  const radiusKm = Number(url.searchParams.get("radius") ?? 50);

  if (!query) {
    return NextResponse.json(
      { error: "Missing query" },
      { status: 400 }
    );
  }

  // 1️⃣ Geocode
  const geoRes = await fetch(
    `${origin}/api/geocode?q=${encodeURIComponent(query)}`
  );

  if (!geoRes.ok) {
    return NextResponse.json(
      { error: "Geocoding failed" },
      { status: 500 }
    );
  }

  const locations = await geoRes.json();

  if (!locations.length) {
    return NextResponse.json([]);
  }

  const { lat, lng, name } = locations[0];

  // 2️⃣ Find nearby races
  const races = await prisma.$queryRaw<
    any[]
  >`
    SELECT r.*
    FROM races r
    JOIN locations l ON r.location_id = l.id
    WHERE ST_DWithin(
      l.location,
      ST_MakePoint(${lng}, ${lat})::geography,
      ${radiusKm * 1000}
    )
    ORDER BY r.race_date ASC
  `;

  return NextResponse.json({
    location: name,
    lat,
    lng,
    races,
  });
}