import { NextResponse } from "next/server";
import crypto from "crypto";

export async function GET() {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const redirectUri = process.env.STRAVA_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "Missing STRAVA_CLIENT_ID or STRAVA_REDIRECT_URI" },
      { status: 500 }
    );
  }

  // CSRF protection
  const state = crypto.randomBytes(16).toString("hex");

  const authorizeUrl = new URL("https://www.strava.com/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("approval_prompt", "auto");
 authorizeUrl.searchParams.set("scope", "read,activity:read");
  authorizeUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(authorizeUrl.toString());

  // store state in httpOnly cookie (short-lived)
  res.cookies.set("strava_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60, // 10 minutes
  });

  return res;
}