import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

type StravaTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  athlete: {
    id: number;
    firstname?: string;
    lastname?: string;
    profile?: string;
  };
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
  }

  // 1) Verify CSRF state
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("strava_oauth_state")?.value;

  if (!expectedState || expectedState !== state) {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET" },
      { status: 500 }
    );
  }

  // 2) Exchange code for token + athlete
  const tokenRes = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return NextResponse.json(
      { error: "Token exchange failed", details: text },
      { status: 400 }
    );
  }

  const data = (await tokenRes.json()) as StravaTokenResponse;

  const athleteId = data.athlete?.id;
  if (!athleteId) {
    return NextResponse.json({ error: "Missing athlete id" }, { status: 400 });
  }

  const displayName = [data.athlete.firstname, data.athlete.lastname]
    .filter(Boolean)
    .join(" ")
    .trim() || `Strava ${athleteId}`;

  const avatarUrl = data.athlete.profile || null;

  // 3) Upsert user (store tokens + activity signal)
  const expiresAt = new Date(data.expires_at * 1000);

  const user = await prisma.public_users.upsert({
    where: { strava_athlete_id: BigInt(athleteId) },
    update: {
      display_name: displayName,
      avatar_url: avatarUrl,

      strava_access_token: data.access_token,
      strava_refresh_token: data.refresh_token,
      strava_token_expires_at: expiresAt,
    },
    create: {
      strava_athlete_id: BigInt(athleteId),
      display_name: displayName,
      avatar_url: avatarUrl,

      strava_access_token: data.access_token,
      strava_refresh_token: data.refresh_token,
      strava_token_expires_at: expiresAt,
    },
  });

    // 3.5) Check if the athlete has at least 1 activity (soft verification)
  let hasActivity = false;
  let lastActivityAt: Date | null = null;

  try {
    const actRes = await fetch(
      "https://www.strava.com/api/v3/athlete/activities?per_page=1&page=1",
      {
        headers: {
          Authorization: `Bearer ${data.access_token}`,
        },
      }
    );

    if (actRes.ok) {
      const acts = (await actRes.json()) as Array<{ start_date?: string }>;
      if (Array.isArray(acts) && acts.length > 0) {
        hasActivity = true;
        if (acts[0]?.start_date) {
          lastActivityAt = new Date(acts[0].start_date);
        }
      }
    }
  } catch {
    // ignore (no badge if we can't check)
  }

  await prisma.public_users.update({
    where: { id: user.id },
    data: {
      strava_has_activity: hasActivity,
      strava_last_activity_at: lastActivityAt,
    },
  });

  // 4) Create session (30 days)

  const session = await prisma.public_sessions.create({
    data: {
      user_id: user.id,
      expires_at: expiresAt,
    },
  });

  // 5) Set session cookie
  const res = NextResponse.redirect(new URL("/", process.env.APP_URL ?? "http://localhost:3000"));

  res.cookies.set("session_id", session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  // Optional: clear the oauth state cookie (one-time use)
  res.cookies.set("strava_oauth_state", "", { path: "/", maxAge: 0 });

  return res;
}