import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");

  if (!query) {
    return NextResponse.json(
      { error: "Missing query" },
      { status: 400 }
    );
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "no"); // Norway only
  url.searchParams.set("addressdetails", "1");

  const res = await fetch(url.toString(), {
    headers: {
      // REQUIRED by Nominatim usage policy
      "User-Agent": "Startstreken/1.0 (contact@startstreken.no)",
    },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "Geocoding failed" },
      { status: 500 }
    );
  }

  const data = await res.json();

  return NextResponse.json(
    data.map((item: any) => ({
      name: item.display_name,
      lat: Number(item.lat),
      lng: Number(item.lon),
      type: item.type,
    }))
  );
}