// src/app/api/athletes/[id]/refresh-eqtiming/route.ts
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

async function getBaseUrl(req: Request) {
  const u = new URL(req.url);
  // hvis du kjører bak proxy/hosting kan du heller bruke headers(),
  // men dette funker i de fleste Next setups.
  return `${u.protocol}//${u.host}`;
}

export async function POST(req: Request, ctx: Ctx) {
  const { id: athleteId } = await ctx.params;

  const source = await prisma.sources.findUnique({ where: { slug: "eqtiming" } });
  if (!source) return Response.json({ error: "Missing source eqtiming" }, { status: 500 });

  const athlete = await prisma.athletes.findUnique({
    where: { id: athleteId },
    select: { id: true, display_name: true },
  });
  if (!athlete) return Response.json({ error: "ATHLETE_NOT_FOUND" }, { status: 404 });

  const identity = await prisma.athlete_identities.findFirst({
    where: { athlete_id: athleteId, source_id: source.id },
    select: { source_person_id: true },
  });

  if (!identity) {
    return Response.json(
      { error: "NO_EQTIMING_UID", message: "Utøveren er ikke koblet til EQTiming UID ennå." },
      { status: 400 }
    );
  }

  const baseUrl = await getBaseUrl(req);

  const res = await fetch(`${baseUrl}/api/eqtiming/import-history`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ uid: identity.source_person_id, name: athlete.display_name }),
    cache: "no-store",
  });

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    return Response.json(
      { error: "IMPORT_HISTORY_FAILED", status: res.status, payload },
      { status: 500 }
    );
  }

  return Response.json(payload);
}