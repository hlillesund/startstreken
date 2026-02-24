// src/app/admin/import/page.tsx
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// Importere vi trenger for EQTiming startliste
import { fetchEqStartlistPage } from "@/lib/eqtiming-startlist";

type DistanceCategory = "5K" | "10K" | "HM" | "M" | "OTHER";
type SourceSlug = "raceresult" | "ultimate" | "eqtiming";

const CATEGORIES: { key: DistanceCategory; label: string }[] = [
  { key: "5K", label: "5K" },
  { key: "10K", label: "10K" },
  { key: "HM", label: "HM" },
  { key: "M", label: "M" },
  { key: "OTHER", label: "OTHER" },
];

function toDateOnly(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  // forvent yyyy-mm-dd
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

function fmtDate(d: Date | null): string {
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/* ---------------- EQTiming helpers ---------------- */

function normName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function getEqName(p: any): string | null {
  const u = p?.Utover ?? p?.utover ?? p?.Athlete ?? null;
  const direct = u?.NavnFormatert ?? u?.NameFormatted ?? u?.FullName;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const fn = (u?.Fornavn ?? u?.FirstName ?? "").toString().trim();
  const ln = (u?.Etternavn ?? u?.LastName ?? "").toString().trim();
  const combined = `${fn} ${ln}`.trim();
  return combined.length >= 2 ? combined : null;
}

function getEqUid(p: any): string | null {
  const u = p?.Utover ?? p?.utover ?? null;
  const uid = u?.UID ?? u?.Id ?? null;
  if (uid === null || uid === undefined) return null;
  return String(uid);
}

/* ---------------- UI utils ---------------- */

function hasAnyOverride(o: {
  event_name?: string | null;
  start_date?: string | null;
  location?: string | null;
  race_name?: string | null;
  distance_m?: number | null;
  distance_category?: DistanceCategory | null;
}) {
  return Boolean(
    o.event_name ||
      o.start_date ||
      o.location ||
      o.race_name ||
      o.distance_m !== null ||
      o.distance_category
  );
}

export default async function AdminImportPage() {
  const sources = await prisma.sources.findMany({
    orderBy: { slug: "asc" },
    select: { id: true, slug: true, name: true },
  });

  const presets = await prisma.import_presets.findMany({
    orderBy: { updated_at: "desc" },
    take: 200,
    include: { sources: { select: { slug: true, name: true } } },
  });

  async function savePreset(formData: FormData) {
    "use server";

    const sourceId = String(formData.get("source_id") ?? "").trim();
    const sourceEventId = String(formData.get("source_event_id") ?? "").trim();

    // ✅ IMPORTANT: source_race_id er ALLTID string i DB (event-only = "")
    const sourceRaceId = String(formData.get("source_race_id") ?? "").trim(); // "" allowed

    if (!sourceId || !sourceEventId) {
      throw new Error("Mangler source + source_event_id");
    }

    const eventName = String(formData.get("event_name") ?? "").trim() || null;
    const startDateStr = String(formData.get("start_date") ?? "").trim() || null;
    const location = String(formData.get("location") ?? "").trim() || null;

    const raceName = String(formData.get("race_name") ?? "").trim() || null;

    const distanceMStr = String(formData.get("distance_m") ?? "").trim();
    const distanceM = distanceMStr ? Number(distanceMStr) : null;

    const distanceCategoryStr = String(formData.get("distance_category") ?? "").trim();
    const distanceCategory =
      (["5K", "10K", "HM", "M", "OTHER"].includes(distanceCategoryStr)
        ? (distanceCategoryStr as DistanceCategory)
        : null) ?? null;

    if (distanceM !== null && !Number.isFinite(distanceM)) {
      throw new Error("distance_m må være et tall");
    }

    await prisma.import_presets.upsert({
      where: {
        source_id_source_event_id_source_race_id: {
          source_id: sourceId,
          source_event_id: sourceEventId,
          source_race_id: sourceRaceId, // ✅ string ("" = event-only)
        },
      },
      update: {
        event_name: eventName,
        start_date: toDateOnly(startDateStr),
        location,
        race_name: raceName,
        distance_m: distanceM,
        distance_category: distanceCategory,
        updated_at: new Date(),
      },
      create: {
        source_id: sourceId,
        source_event_id: sourceEventId,
        source_race_id: sourceRaceId, // ✅ string ("" = event-only)
        event_name: eventName,
        start_date: toDateOnly(startDateStr),
        location,
        race_name: raceName,
        distance_m: distanceM,
        distance_category: distanceCategory,
        updated_at: new Date(),
      },
    });

    revalidatePath("/admin/import");
  }

  async function deletePreset(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "").trim();
    if (!id) return;
    await prisma.import_presets.delete({ where: { id } });
    revalidatePath("/admin/import");
  }

  async function applyPresetNow(formData: FormData) {
    "use server";

    const presetId = String(formData.get("preset_id") ?? "").trim();
    if (!presetId) return;

    const p = await prisma.import_presets.findUnique({
      where: { id: presetId },
      include: { sources: { select: { id: true, slug: true } } },
    });
    if (!p) return;

    const eventRow = await prisma.events.findUnique({
      where: {
        source_id_source_event_id: {
          source_id: p.source_id,
          source_event_id: p.source_event_id,
        },
      },
      select: { id: true },
    });

    if (eventRow) {
      await prisma.events.update({
        where: { id: eventRow.id },
        data: {
          name: p.event_name ?? undefined,
          start_date: p.start_date ?? undefined,
          location: p.location ?? undefined,
          updated_at: new Date(),
        },
      });

      // race-only hvis source_race_id ikke er tom streng
      if (p.source_race_id && p.source_race_id.length > 0) {
        const raceRow = await prisma.races.findUnique({
          where: {
            event_id_source_race_id: {
              event_id: eventRow.id,
              source_race_id: p.source_race_id,
            },
          },
          select: { id: true },
        });

        if (raceRow) {
          await prisma.races.update({
            where: { id: raceRow.id },
            data: {
              name: p.race_name ?? undefined,
              distance_m: p.distance_m ?? undefined,
            },
          });

          if (p.distance_category) {
            await prisma.results.updateMany({
              where: { race_id: raceRow.id },
              data: { distance_category: p.distance_category },
            });
          }
        }
      }
    }

    revalidatePath("/admin/import");
  }

  async function runImport(formData: FormData) {
    "use server";

    const sourceSlug = String(formData.get("source_slug") ?? "").trim() as SourceSlug;
    const sourceEventId = String(formData.get("source_event_id_run") ?? "").trim();

    // Optional race id (brukes for RR/Ultimate – og evt EQ hvis du vil sette race-specific senere)
    const sourceRaceIdRun = String(formData.get("source_race_id_run") ?? "").trim(); // "" ok

    // override fields (valgfritt – lagres som preset hvis utfylt)
    const override = {
      event_name: String(formData.get("o_event_name") ?? "").trim() || null,
      start_date: String(formData.get("o_start_date") ?? "").trim() || null,
      location: String(formData.get("o_location") ?? "").trim() || null,
      race_name: String(formData.get("o_race_name") ?? "").trim() || null,
      distance_m: (() => {
        const v = String(formData.get("o_distance_m") ?? "").trim();
        if (!v) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      })(),
      distance_category: (() => {
        const v = String(formData.get("o_distance_category") ?? "").trim();
        if (!v) return null;
        return (["5K", "10K", "HM", "M", "OTHER"].includes(v) ? (v as DistanceCategory) : null) ?? null;
      })(),
    };

    if (!sourceSlug || !sourceEventId) {
      throw new Error("Mangler source + event id");
    }

    const source = await prisma.sources.findUnique({ where: { slug: sourceSlug } });
    if (!source) throw new Error(`Mangler sources-row for ${sourceSlug}`);

    // ---- 0) bestem raceKey (source_race_id i preset) ----
    // event-only = ""
    let raceKey = "";

    if (sourceSlug === "raceresult") {
      // For RR: vi bygger raceKey stabilt på samme måte som import-route:
      // listName|contest|filterOrALL
      const listName = String(formData.get("rr_listName") ?? "Online|Final").trim();
      const contest = Number(String(formData.get("rr_contest") ?? "0").trim());
      const filter = String(formData.get("rr_filter") ?? "").trim();
      raceKey = `${listName}|${Number.isFinite(contest) ? contest : 0}|${filter || "ALL"}`;
    } else if (sourceSlug === "ultimate") {
      const distance = String(formData.get("ult_distance") ?? "").trim();
      raceKey = distance || sourceRaceIdRun || "default";
    } else if (sourceSlug === "eqtiming") {
      // EQTiming: admin-import = startliste. Den har ikke raceId her.
      // Derfor: event-only preset som default => ""
      raceKey = sourceRaceIdRun || "";
    }

    // ---- 1) hvis override er satt: upsert preset (race-specific hvis raceKey != "", ellers event-only) ----
    if (hasAnyOverride(override)) {
      await prisma.import_presets.upsert({
        where: {
          source_id_source_event_id_source_race_id: {
            source_id: source.id,
            source_event_id: sourceEventId,
            source_race_id: raceKey, // ✅ string ("" = event-only)
          },
        },
        update: {
          event_name: override.event_name,
          start_date: toDateOnly(override.start_date),
          location: override.location,
          race_name: override.race_name,
          distance_m: override.distance_m,
          distance_category: override.distance_category,
          updated_at: new Date(),
        },
        create: {
          source_id: source.id,
          source_event_id: sourceEventId,
          source_race_id: raceKey, // ✅ string ("" = event-only)
          event_name: override.event_name,
          start_date: toDateOnly(override.start_date),
          location: override.location,
          race_name: override.race_name,
          distance_m: override.distance_m,
          distance_category: override.distance_category,
          updated_at: new Date(),
        },
      });
    }

    // ---- 2) kjør import (og apply override på event/race der vi kan) ----
    if (sourceSlug === "eqtiming") {
      // ✅ EQTiming import = hent startliste og knytt identities (ikke resultater)
      const eventId = Number(sourceEventId);
      if (!Number.isFinite(eventId)) throw new Error("EQTiming: event id må være et tall");

      // event skeleton (slik at override av event_navn/dato/sted gir effekt med en gang)
      const eventRow = await prisma.events.upsert({
        where: {
          source_id_source_event_id: { source_id: source.id, source_event_id: String(eventId) },
        },
        update: {
          name: override.event_name ?? undefined,
          start_date: toDateOnly(override.start_date) ?? undefined,
          location: override.location ?? undefined,
          updated_at: new Date(),
        },
        create: {
          source_id: source.id,
          source_event_id: String(eventId),
          name: override.event_name ?? `EQTiming event ${eventId}`,
          start_date: toDateOnly(override.start_date),
          location: override.location ?? null,
          updated_at: new Date(),
        },
        select: { id: true },
      });

      // Startliste paging
      const pageSize = 200;
      let startAt = 1;
      let imported = 0;

      while (true) {
        const data = await fetchEqStartlistPage(eventId, startAt, pageSize);

        const items: any[] =
          Array.isArray(data)
            ? data
            : Array.isArray((data as any)?.Items)
              ? (data as any).Items
              : (data as any)?.Items && typeof (data as any).Items === "object"
                ? Object.values((data as any).Items)
                : Array.isArray((data as any)?.Rows)
                  ? (data as any).Rows
                  : [];

        if (items.length === 0) break;

        for (const p of items) {
          const name = getEqName(p);
          const uid = getEqUid(p);
          if (!name || !uid) continue;

          const athlete = await prisma.athletes.upsert({
            where: { display_name_norm: normName(name) },
            update: { display_name: name },
            create: { display_name: name, display_name_norm: normName(name) },
          });

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

          imported++;
        }

        startAt += pageSize;
        if (items.length < pageSize) break;
      }

      // NB: Race override kan ikke apply’es her (EQ har raceId per Etappe i historikk),
      // men event override er allerede satt på eventRow over.

      revalidatePath("/admin/import");
      return;
    }

    if (sourceSlug === "raceresult") {
      // Vi sender deg videre til /api/raceresult/import-results (som du allerede har)
      const eventId = Number(sourceEventId);
      if (!Number.isFinite(eventId)) throw new Error("RaceResult: event id må være et tall");

      const key = String(formData.get("rr_key") ?? "").trim();
      const listName = String(formData.get("rr_listName") ?? "Online|Final").trim();
      const contest = Number(String(formData.get("rr_contest") ?? "0").trim());
      const filter = String(formData.get("rr_filter") ?? "").trim();

      if (!key) throw new Error("RaceResult: mangler key");

      // Kjør import-route (samme host). I server action fungerer relative fetch.
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/raceresult/import-results`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId, key, listName, contest, filter }),
        cache: "no-store",
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`RaceResult import feilet: ${res.status} ${t}`);
      }

      // Apply override direkte på event/race i DB når importen har opprettet dem.
      // Event override:
      if (override.event_name || override.start_date || override.location) {
        await prisma.events.updateMany({
          where: {
            source_id: source.id,
            source_event_id: String(eventId),
          },
          data: {
            name: override.event_name ?? undefined,
            start_date: toDateOnly(override.start_date) ?? undefined,
            location: override.location ?? undefined,
            updated_at: new Date(),
          },
        });
      }

      // Race override: kun hvis raceKey != ""
      if (raceKey.length > 0 && (override.race_name || override.distance_m !== null || override.distance_category)) {
        const ev = await prisma.events.findUnique({
          where: { source_id_source_event_id: { source_id: source.id, source_event_id: String(eventId) } },
          select: { id: true },
        });
        if (ev) {
          const race = await prisma.races.findUnique({
            where: { event_id_source_race_id: { event_id: ev.id, source_race_id: raceKey } },
            select: { id: true },
          });
          if (race) {
            await prisma.races.update({
              where: { id: race.id },
              data: {
                name: override.race_name ?? undefined,
                distance_m: override.distance_m ?? undefined,
              },
            });

            if (override.distance_category) {
              await prisma.results.updateMany({
                where: { race_id: race.id },
                data: { distance_category: override.distance_category },
              });
            }
          }
        }
      }

      revalidatePath("/admin/import");
      return;
    }

    if (sourceSlug === "ultimate") {
      // Vi sender deg videre til /api/ultimate/import (som du allerede har)
      const eventId = Number(sourceEventId);
      if (!Number.isFinite(eventId)) throw new Error("Ultimate: event id må være et tall");

      const distanceStr = String(formData.get("ult_distance") ?? "").trim();
      const distance = distanceStr ? Number(distanceStr) : null;
      if (distance !== null && !Number.isFinite(distance)) throw new Error("Ultimate: distance må være et tall");

      const onlyNor = Boolean(formData.get("ult_onlyNor"));

      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/ultimate/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId, distance, onlyNor }),
        cache: "no-store",
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`Ultimate import feilet: ${res.status} ${t}`);
      }

      // Apply override på event + race
      if (override.event_name || override.start_date || override.location) {
        await prisma.events.updateMany({
          where: { source_id: source.id, source_event_id: String(eventId) },
          data: {
            name: override.event_name ?? undefined,
            start_date: toDateOnly(override.start_date) ?? undefined,
            location: override.location ?? undefined,
            updated_at: new Date(),
          },
        });
      }

      const ultimateRaceKey = raceKey; // distance / "default"
      if (ultimateRaceKey.length > 0 && (override.race_name || override.distance_m !== null || override.distance_category)) {
        const ev = await prisma.events.findUnique({
          where: { source_id_source_event_id: { source_id: source.id, source_event_id: String(eventId) } },
          select: { id: true },
        });
        if (ev) {
          const race = await prisma.races.findUnique({
            where: { event_id_source_race_id: { event_id: ev.id, source_race_id: ultimateRaceKey } },
            select: { id: true },
          });
          if (race) {
            await prisma.races.update({
              where: { id: race.id },
              data: {
                name: override.race_name ?? undefined,
                distance_m: override.distance_m ?? undefined,
              },
            });

            if (override.distance_category) {
              await prisma.results.updateMany({
                where: { race_id: race.id },
                data: { distance_category: override.distance_category },
              });
            }
          }
        }
      }

      revalidatePath("/admin/import");
      return;
    }

    throw new Error(`Ukjent sourceSlug: ${sourceSlug}`);
  }

  return (
    <section className="min-h-screen w-full bg-black text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Admin • Import</h1>
          <p className="mt-2 text-white/70">
            Importer løp fra Ultimate / RaceResult / EQTiming, og legg inn overrides (navn/dato/distanse) samtidig.
          </p>
        </div>

        {/* -------- RUN IMPORT -------- */}
        <div className="rounded-2xl border border-white/15 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
          <h2 className="text-lg font-semibold">Importer løp</h2>

          <form action={runImport} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm text-white/70">Tidtaking (source)</label>
              <select
                name="source_slug"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none"
                required
                defaultValue={(sources.find((s) => s.slug === "raceresult")?.slug ?? sources[0]?.slug ?? "") as any}
              >
                {sources.map((s) => (
                  <option key={s.id} value={s.slug}>
                    {s.slug} — {s.name}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-xs text-white/50">
                EQTiming-import her = startliste (kobler utøvere/UID). Resultater kommer via utøver-refresh (din eksisterende route).
              </div>
            </div>

            <div>
              <label className="text-sm text-white/70">source_event_id</label>
              <input
                name="source_event_id_run"
                placeholder="f.eks 258952"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
                required
              />
            </div>

            <div>
              <label className="text-sm text-white/70">source_race_id (valgfritt)</label>
              <input
                name="source_race_id_run"
                placeholder="(ofte tom) — brukes mest for race-specific preset"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
              />
              <div className="mt-1 text-xs text-white/50">
                La tom for event-only. For RaceResult/Ultimate setter vi raceKey automatisk fra feltene under.
              </div>
            </div>

            <div className="hidden md:block" />

            {/* RaceResult params */}
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4 md:col-span-2">
              <div className="text-sm font-semibold text-white/80">RaceResult parametre</div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                <input
                  name="rr_key"
                  placeholder="key=..."
                  className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
                />
                <input
                  name="rr_listName"
                  placeholder='listName (f.eks "Online|Final")'
                  defaultValue="Online|Final"
                  className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
                />
                <input
                  name="rr_contest"
                  placeholder="contest (f.eks 0)"
                  defaultValue="0"
                  className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
                />
                <input
                  name="rr_filter"
                  placeholder='filter (f.eks "10 km")'
                  className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
                />
              </div>
              <div className="mt-2 text-xs text-white/50">
                RaceResult raceKey bygges som: <span className="text-white/70">listName|contest|filterOrALL</span>
              </div>
            </div>

            {/* Ultimate params */}
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4 md:col-span-2">
              <div className="text-sm font-semibold text-white/80">Ultimate parametre</div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                <input
                  name="ult_distance"
                  placeholder="distance (f.eks 21097)"
                  className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
                />
                <label className="flex items-center gap-2 text-sm text-white/70">
                  <input name="ult_onlyNor" type="checkbox" className="h-4 w-4" />
                  Kun NOR (search-mode)
                </label>
              </div>
            </div>

            {/* Overrides */}
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4 md:col-span-2">
              <div className="text-sm font-semibold text-white/80">Overrides (valgfritt)</div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <input
                  name="o_event_name"
                  placeholder="Event navn (f.eks Sommernattsløpet 2024)"
                  className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
                />
                <input
                  name="o_start_date"
                  type="date"
                  className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none"
                />
                <input
                  name="o_location"
                  placeholder="Sted (f.eks Bergen)"
                  className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
                />
                <div className="hidden md:block" />

                <input
                  name="o_race_name"
                  placeholder="Race navn (f.eks 10 km / Halvmaraton)"
                  className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
                />
                <input
                  name="o_distance_m"
                  inputMode="numeric"
                  placeholder="distance_m (f.eks 10000 / 21097)"
                  className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
                />

                <select
                  name="o_distance_category"
                  className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none"
                  defaultValue=""
                >
                  <option value="">distance_category (ingen)</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>

                <button className="w-full rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-white/90">
                  Kjør import
                </button>
              </div>

              <div className="mt-2 text-xs text-white/50">
                Hvis du fyller inn overrides, lagres de automatisk som preset (race-spesifikk når mulig, ellers event-only).
              </div>
            </div>
          </form>
        </div>

        {/* -------- PRESETS -------- */}
        <div className="mt-8 rounded-2xl border border-white/15 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-semibold">Eksisterende presets</h2>
            <div className="text-sm text-white/60">{presets.length} vist</div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
            <div className="grid grid-cols-12gap-0 border-b border-white/10 bg-black/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-white/70">
              <div className="col-span-3">Kilde</div>
              <div className="col-span-4">Event / Race</div>
              <div className="col-span-3">Dato / Sted</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>

            <div className="divide-y divide-white/10">
              {presets.map((p) => (
                <div key={p.id} className="grid grid-cols-12 gap-0 bg-black/40 px-4 py-4 text-white">
                  <div className="col-span-3">
                    <div className="text-sm font-medium">{p.sources.slug}</div>
                    <div className="text-xs text-white/55">{p.sources.name}</div>
                    <div className="mt-2 text-[11px] text-white/50">
                      event: <span className="text-white/70">{p.source_event_id}</span>
                      <br />
                      race:{" "}
                      {p.source_race_id ? (
                        <span className="text-white/70">{p.source_race_id}</span>
                      ) : (
                        <span className="text-white/50">(event-only)</span>
                      )}
                    </div>
                  </div>

                  <div className="col-span-4">
                    <div className="text-sm font-semibold">
                      {p.event_name ?? <span className="text-white/50">(ingen event override)</span>}
                    </div>
                    <div className="mt-1 text-xs text-white/60">
                      {p.race_name ?? <span className="text-white/50">(ingen race override)</span>}
                      {p.distance_m ? (
                        <span className="ml-2 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white/70">
                          {p.distance_m}m
                        </span>
                      ) : null}
                      {p.distance_category ? (
                        <span className="ml-2 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white/70">
                          {p.distance_category}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="col-span-3 text-sm text-white/70">
                    <div>{p.start_date ? fmtDate(p.start_date as any) : "-"}</div>
                    <div className="text-xs text-white/55">{p.location ?? "-"}</div>
                    <div className="mt-2 text-[11px] text-white/45">
                      oppdatert {new Date(p.updated_at).toLocaleString("nb-NO")}
                    </div>
                  </div>

                  <div className="col-span-2 flex justify-end gap-2">
                    <form action={applyPresetNow}>
                      <input type="hidden" name="preset_id" value={p.id} />
                      <button className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10">
                        Apply nå
                      </button>
                    </form>

                    <form action={deletePreset}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/20">
                        Slett
                      </button>
                    </form>
                  </div>
                </div>
              ))}

              {presets.length === 0 && (
                <div className="bg-black/40 px-4 py-6 text-sm text-white/70">Ingen presets ennå.</div>
              )}
            </div>
          </div>
        </div>

        {/* Optional: manual preset editor (samme som før) */}
        <div className="mt-10 rounded-2xl border border-white/15 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
          <h2 className="text-lg font-semibold">Lag / oppdater preset manuelt</h2>

          <form action={savePreset} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm text-white/70">Tidtaking (source)</label>
              <select
                name="source_id"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none"
                required
                defaultValue={sources[0]?.id ?? ""}
              >
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.slug} — {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm text-white/70">source_event_id</label>
              <input
                name="source_event_id"
                placeholder="f.eks 258952"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
                required
              />
            </div>

            <div>
              <label className="text-sm text-white/70">source_race_id (tom = event-only)</label>
              <input
                name="source_race_id"
                placeholder="f.eks Online|Final|0|10 km"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
              />
            </div>

            <div className="hidden md:block" />

            <div>
              <label className="text-sm text-white/70">Event navn</label>
              <input
                name="event_name"
                placeholder="Sommernattsløpet 2024"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
              />
            </div>

            <div>
              <label className="text-sm text-white/70">Startdato</label>
              <input
                name="start_date"
                type="date"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none"
              />
            </div>

            <div>
              <label className="text-sm text-white/70">Sted</label>
              <input
                name="location"
                placeholder="Bergen"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
              />
            </div>

            <div className="hidden md:block" />

            <div>
              <label className="text-sm text-white/70">Race navn</label>
              <input
                name="race_name"
                placeholder="10 km"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
              />
            </div>

            <div>
              <label className="text-sm text-white/70">distance_m</label>
              <input
                name="distance_m"
                inputMode="numeric"
                placeholder="10000"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
              />
            </div>

            <div>
              <label className="text-sm text-white/70">distance_category</label>
              <select
                name="distance_category"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none"
                defaultValue=""
              >
                <option value="">(ingen)</option>
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button className="w-full rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-white/90">
                Lagre preset
              </button>
            </div>
          </form>
        </div>

        <div className="mt-8 text-xs text-white/50">
          Tips: Fyll ut overrides når du importerer, så slipper du “manuell DB-fiks” etterpå.
        </div>
      </div>
    </section>
  );
}