import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const radiusKm = Number(searchParams.get("radius") ?? 50);

  if (!lat || !lng) {
    return NextResponse.json(
      { error: "lat and lng are required" },
      { status: 400 }
    );
  }

  const races = await prisma.$queryRaw<
    {
      id: string;
      name: string;
      race_date: Date;
      distance_km: number;
      race_type: string;
      location_id: string;
    }[]
  >`
    select
      r.id,
      r.name,
      r.race_date,
      r.distance_km,
      r.race_type,
      r.location_id
    from races r
    join locations l on r.location_id = l.id
    where ST_DWithin(
      l.location,
      ST_MakePoint(${lng}, ${lat})::geography,
      ${radiusKm * 1000}
    )
    order by r.race_date asc
  `;

  return NextResponse.json(races);
}