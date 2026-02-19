import { prisma } from "@/lib/prisma";
import { fetchEqStartlistPage } from "@/lib/eqtiming-startlist";

function normName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function getName(p: any): string | null {
  const u = p?.Utover ?? p?.utover ?? p?.Athlete ?? null;
  const direct = u?.NavnFormatert ?? u?.NameFormatted ?? u?.FullName;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const fn = (u?.Fornavn ?? u?.FirstName ?? "").toString().trim();
  const ln = (u?.Etternavn ?? u?.LastName ?? "").toString().trim();
  const combined = `${fn} ${ln}`.trim();
  return combined.length >= 2 ? combined : null;
}

function getUid(p: any): string | null {
  const u = p?.Utover ?? p?.utover ?? null;
  const uid = u?.UID ?? u?.Id ?? null;
  if (uid === null || uid === undefined) return null;
  return String(uid);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const eventId = Number(body.eventId);

  if (!Number.isFinite(eventId)) {
    return Response.json({ error: "Need eventId (number)" }, { status: 400 });
  }

  const source = await prisma.sources.findUnique({ where: { slug: "eqtiming" } });
  if (!source) return Response.json({ error: "Missing sources row for eqtiming" }, { status: 500 });

  const pageSize = 200; // kan justeres
  let startAt = 1;
  let totalImported = 0;
  let firstKeysPrinted = false;

  while (true) {
    const data = await fetchEqStartlistPage(eventId, startAt, pageSize);

    if (!firstKeysPrinted) {
  console.log("Startlist raw top-level keys:", data && typeof data === "object" ? Object.keys(data) : typeof data);
  console.log("Startlist raw sample (stringified):", JSON.stringify(data).slice(0, 1200));
}
    // EQTiming kan returnere enten array eller wrapper-objekt.
   const items: any[] =
  Array.isArray(data) ? data
  : Array.isArray((data as any)?.Items) ? (data as any).Items
  : (data as any)?.Items && typeof (data as any).Items === "object"
    ? Object.values((data as any).Items)
    : Array.isArray((data as any)?.Rows) ? (data as any).Rows
    : [];

    if (!firstKeysPrinted) {
      console.log("Startlist first item keys:", items?.[0] ? Object.keys(items[0]) : "no items");
      console.log("Startlist first item sample:", items?.[0] ?? null);
      firstKeysPrinted = true;
    }

    if (items.length === 0) break;

    for (const p of items) {
      const name = getName(p);
      const uid = getUid(p);
      if (!name || !uid) continue;

      // 1) upsert athlete (krever unik index på display_name_norm – som du allerede har lagt)
      const athlete = await prisma.athletes.upsert({
        where: { display_name_norm: normName(name) },
        update: { display_name: name },
        create: { display_name: name, display_name_norm: normName(name) },
      });

      // 2) upsert identity (schema ditt: source_id + source_person_id)
      await prisma.athlete_identities.upsert({
        where: {
          source_id_source_person_id: {
            source_id: source.id,
            source_person_id: uid,
          },
        },
        update: { athlete_id: athlete.id },
        create: { athlete_id: athlete.id, source_id: source.id, source_person_id: uid },
      });

      totalImported++;
    }

    // neste side
    startAt += pageSize;

    // stop hvis vi fikk mindre enn pageSize
    if (items.length < pageSize) break;
  }

  return Response.json({ ok: true, eventId, imported: totalImported });
}