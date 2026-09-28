// src/app/api/eqtiming/import-startlist/route.ts
import { importEqStartlistBatch } from "@/lib/eq-batch-import";

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
  const uid = p?.Utover?.UID ?? p?.Utover?.Id ?? null;
  if (uid === null || uid === undefined) return null;
  const s = String(uid).trim();
  return s ? s : null;
}

function getBib(p: any): string | null {
  const candidates = ["Startnumber", "StartNumber", "StartNr", "StartNo", "Startnummer", "Bib", "BIB"];

  // 1) toppnivå
  for (const k of candidates) {
    const v = (p as any)?.[k];
    if (v !== null && v !== undefined && String(v).trim()) return String(v).trim();
  }

  // 2) under Utover/Athlete
  const u = p?.Utover ?? p?.utover ?? p?.Athlete ?? null;
  for (const k of candidates) {
    const v = u?.[k];
    if (v !== null && v !== undefined && String(v).trim()) return String(v).trim();
  }

  // 3) fallback: Startnummer / FullStartnummer (det du faktisk har sett i payload)
  const v = p?.Startnummer ?? p?.FullStartnummer ?? null;
  if (v !== null && v !== undefined && String(v).trim()) return String(v).trim();

  // 4) siste utvei: scan keynavn
  const keys = Object.keys(p ?? {});
  const maybe = keys.find((k) => /start|bib/i.test(k));
  if (maybe) {
    const mv = (p as any)?.[maybe];
    if (mv !== null && mv !== undefined && String(mv).trim()) return String(mv).trim();
  }

  return null;
}

function getClassName(p: any): string | null {
  const c = p?.Klasse?.Navn ?? p?.Klasse?.Name ?? p?.Class ?? p?.class ?? null;
  if (typeof c !== "string") return null;
  const t = c.trim();
  return t ? t : null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const eventId = Number(body.eventId);
  if (!Number.isFinite(eventId)) {
    return Response.json({ error: "Need eventId (number)" }, { status: 400 });
  }

  const pageSize = Number(body.pageSize ?? 200);
  let startAt = Number(body.startAt ?? 1);

  if (!Number.isFinite(pageSize) || pageSize <= 0) {
    return Response.json({ error: "pageSize must be a positive number" }, { status: 400 });
  }
  if (!Number.isFinite(startAt) || startAt <= 0) startAt = 1;

  const source = await prisma.sources.findUnique({ where: { slug: "eqtiming" } });
  if (!source) return Response.json({ error: "Missing sources row for eqtiming" }, { status: 500 });

  let totalImported = 0;
  let pages = 0;

  while (true) {
    const data = await fetchEqStartlistPage(eventId, startAt, pageSize);

    const items: any[] = Array.isArray(data)
      ? data
      : Array.isArray((data as any)?.Items)
        ? (data as any).Items
        : (data as any)?.Items && typeof (data as any).Items === "object"
          ? Object.values((data as any).Items)
          : Array.isArray((data as any)?.Rows)
            ? (data as any).Rows
            : [];

    if (items.length === 0) break;

    // Dedup per page: EQTiming kan returnere identiske deltakere flere ganger
    const seen = new Set<string>();
    const deduped: any[] = [];

    for (const p of items) {
      const uid = p?.Utover?.UID ?? p?.Utover?.Id ?? p?.UID ?? null;
      if (!uid) continue;

      const key = String(uid).trim();
      if (!key) continue;

      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(p);
    }

    if (pages === 0) {
      console.log("Startlist raw top-level keys:", data && typeof data === "object" ? Object.keys(data) : typeof data);
      console.log("Startlist first item keys:", items?.[0] ? Object.keys(items[0]) : "no items");
      console.log("Deduped items on first page:", { before: items.length, after: deduped.length });
    }

const result = await importEqStartlistBatch(source.id, eventId, deduped);
totalImported += result.imported;

    pages++;
    startAt += pageSize;
    if (items.length < pageSize) break;
  }

  return Response.json({ ok: true, eventId, pages, imported: totalImported });
}