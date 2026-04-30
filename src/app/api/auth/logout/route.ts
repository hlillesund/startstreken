import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session_id")?.value;

  // Always clear cookie, even if session missing
  const res = NextResponse.json({ ok: true });
  res.cookies.set("session_id", "", { path: "/", maxAge: 0 });

  if (!sessionId) return res;

  // Best-effort delete
  try {
    await prisma.public_sessions.delete({ where: { id: sessionId } });
  } catch {}

  return res;
}