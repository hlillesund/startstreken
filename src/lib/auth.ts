import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function requireUser() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session_id")?.value;

  if (!sessionId) return null;

  const session = await prisma.public_sessions.findUnique({
    where: { id: sessionId },
    include: { users: true },
  });

  if (!session) return null;
  if (session.expires_at.getTime() < Date.now()) return null;

  return session.users; // public_users record
}