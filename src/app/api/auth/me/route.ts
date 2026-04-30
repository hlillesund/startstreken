import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });

  return NextResponse.json({
    user: {
      id: user.id,
      stravaAthleteId: user.strava_athlete_id.toString(),
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
    },
  });
}