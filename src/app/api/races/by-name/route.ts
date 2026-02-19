import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");

  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

 const races = await prisma.races.findMany({
  where: {
    name: {
      contains: q,
      mode: "insensitive",
    },
  },
  select: {
    id: true,
    name: true,
    race_date: true,
    distance_km: true,
    race_type: true,
    logo_url: true,
  },
  orderBy: { race_date: "asc" },
  take: 6,
});

  return NextResponse.json(races);
}