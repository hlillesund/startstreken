// src/app/admin/import/page.tsx
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

type DistanceCategory = "5K" | "10K" | "HM" | "M" | "OTHER";

const CATEGORIES: { key: DistanceCategory; label: string }[] = [
  { key: "5K", label: "5K" },
  { key: "10K", label: "10K" },
  { key: "HM", label: "HM" },
  { key: "M", label: "M" },
  { key: "OTHER", label: "OTHER" },
];

function toDateOnly(dateStr: string | null): Date | null {
  if (!dateStr) return null;
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

async function getBaseUrl() {
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  if (!host) return "http://localhost:3000";
  return `${proto}://${host}`;
}

type ImportResult =
  | { ok: true; summary: any; overridesSaved?: boolean }
  | { ok: false; error: string };

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

  async function saveOverridePreset(args: {
    sourceSlug: string;
    sourceEventId: string;
    sourceRaceId: string; // alltid string ("" = event-only)
    event_name: string | null;
    start_date: string | null; // yyyy-mm-dd
    location: string | null;
    race_name: string | null;
    distance_m: number | null;
    distance_category: DistanceCategory | null;
  }) {
    "use server";

    const source = await prisma.sources.findUnique({ where: { slug: args.sourceSlug } });
    if (!source) throw new Error(`Missing source: ${args.sourceSlug}`);

    await prisma.import_presets.upsert({
      where: {
        source_id_source_event_id_source_race_id: {
          source_id: source.id,
          source_event_id: args.sourceEventId,
          source_race_id: args.sourceRaceId,
        },
      },
      update: {
        event_name: args.event_name,
        start_date: toDateOnly(args.start_date),
        location: args.location,
        race_name: args.race_name,
        distance_m: args.distance_m,
        distance_category: args.distance_category,
        updated_at: new Date(),
      },
      create: {
        source_id: source.id,
        source_event_id: args.sourceEventId,
        source_race_id: args.sourceRaceId,
        event_name: args.event_name,
        start_date: toDateOnly(args.start_date),
        location: args.location,
        race_name: args.race_name,
        distance_m: args.distance_m,
        distance_category: args.distance_category,
        updated_at: new Date(),
      },
    });
  }

  async function runImport(formData: FormData): Promise<ImportResult> {
    "use server";

    const baseUrl = await getBaseUrl();
    const sourceSlug = String(formData.get("sourceSlug") ?? "").trim();
    if (!sourceSlug) return { ok: false, error: "Mangler sourceSlug" };

    // felles override-felter (preset-save)
    const overrideEnabled = Boolean(formData.get("override_enabled"));

    const o_eventName = String(formData.get("event_name") ?? "").trim() || null;
    const o_startDate = String(formData.get("start_date") ?? "").trim() || null;
    const o_location = String(formData.get("location") ?? "").trim() || null;

    const o_raceName = String(formData.get("race_name") ?? "").trim() || null;

    const distMStr = String(formData.get("distance_m") ?? "").trim();
    const o_distanceM = distMStr ? Number(distMStr) : null;
    if (o_distanceM !== null && !Number.isFinite(o_distanceM)) {
      return { ok: false, error: "distance_m må være et tall" };
    }

    const catStr = String(formData.get("distance_category") ?? "").trim();
    const o_cat =
      (["5K", "10K", "HM", "M", "OTHER"].includes(catStr)
        ? (catStr as DistanceCategory)
        : null) ?? null;

    const hasSomething =
      Boolean(o_eventName || o_startDate || o_location || o_raceName || o_distanceM !== null || o_cat);

    const savePresetIfNeeded = async (key: { sourceEventId: string; sourceRaceId: string }) => {
      if (!overrideEnabled) return false;
      if (!hasSomething) return false;

      await saveOverridePreset({
        sourceSlug,
        sourceEventId: key.sourceEventId,
        sourceRaceId: key.sourceRaceId,
        event_name: o_eventName,
        start_date: o_startDate,
        location: o_location,
        race_name: o_raceName,
        distance_m: o_distanceM,
        distance_category: o_cat,
      });

      return true;
    };

    try {
      // ---------------- ULTIMATE ----------------
      if (sourceSlug === "ultimate") {
        const eventIdStr = String(formData.get("ult_eventId") ?? "").trim();
        const distanceStr = String(formData.get("ult_distance") ?? "").trim();
        const onlyNor = Boolean(formData.get("ult_onlyNor"));

        const eventId = Number(eventIdStr);
        const distance = Number(distanceStr);

        if (!Number.isFinite(eventId)) return { ok: false, error: "Ultimate: eventId må være tall" };
        if (!Number.isFinite(distance)) return { ok: false, error: "Ultimate: distance må være tall (f.eks 1/2/…)" };

        const sourceEventId = String(eventId);
        const sourceRaceId = String(distance);

        // ✅ lagre preset før import hvis ønsket (så apply-overrides kan treffe ved refresh/import også)
        const saved = await savePresetIfNeeded({ sourceEventId, sourceRaceId });

   const override = {
  event_name: o_eventName,
  start_date: o_startDate,
  location: o_location,
  race_name: o_raceName,
  distance_m: o_distanceM,
  distance_category: o_cat,
};

const res = await fetch(`${baseUrl}/api/ultimate/import-results`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ eventId, distance, onlyNor, override }),
  cache: "no-store",
});

        if (!res.ok) {
          const t = await res.text().catch(() => "");
          return { ok: false, error: `Ultimate import feilet: ${res.status} ${t}` };
        }

        const summary = await res.json().catch(() => ({}));
        revalidatePath("/admin/import");
        return { ok: true, summary, overridesSaved: saved };
      }

      // ---------------- RACERESULT ----------------
      if (sourceSlug === "raceresult") {
        const eventIdStr = String(formData.get("rr_eventId") ?? "").trim();
        const key = String(formData.get("rr_key") ?? "").trim();
        const listName = String(formData.get("rr_listName") ?? "Online|Final").trim();
        const contestStr = String(formData.get("rr_contest") ?? "0").trim();
        const filter = String(formData.get("rr_filter") ?? "").trim();

        const eventId = Number(eventIdStr);
        const contest = Number(contestStr);

        if (!Number.isFinite(eventId)) return { ok: false, error: "RaceResult: eventId må være tall" };
        if (!key) return { ok: false, error: "RaceResult: mangler key" };
        if (!Number.isFinite(contest)) return { ok: false, error: "RaceResult: contest må være tall" };

        const sourceEventId = String(eventId);
        const sourceRaceId = `${listName}|${contest}|${filter || "ALL"}`;

        const saved = await savePresetIfNeeded({ sourceEventId, sourceRaceId });

        const res = await fetch(`${baseUrl}/api/raceresult/import-results`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ eventId, key, listName, contest, filter }),
          cache: "no-store",
        });

        if (!res.ok) {
          const t = await res.text().catch(() => "");
          return { ok: false, error: `RaceResult import feilet: ${res.status} ${t}` };
        }

        const summary = await res.json().catch(() => ({}));
        revalidatePath("/admin/import");
        return { ok: true, summary, overridesSaved: saved };
      }

      // ---------------- EQTIMING (OPPDATERT) ----------------
      if (sourceSlug === "eqtiming") {
        const eventIdStr = String(formData.get("eq_eventId") ?? "").trim();
        const eventId = Number(eventIdStr);
        if (!Number.isFinite(eventId)) return { ok: false, error: "EQTiming: eventId må være tall" };

        const sourceEventId = String(eventId);
        const sourceRaceId = ""; // event-only preset

        // ✅ lagre event-only preset før import (valgfritt)
        const saved = await savePresetIfNeeded({ sourceEventId, sourceRaceId });

        // ✅ Kjør din "import-run" som gjør: startliste + resultater (report 347) + match
        const res = await fetch(`${baseUrl}/api/admin/import-run`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sourceSlug: "eqtiming", params: { eventId } }),
          cache: "no-store",
        });

        if (!res.ok) {
          const t = await res.text().catch(() => "");
          return { ok: false, error: `EQTiming import feilet: ${res.status} ${t}` };
        }

        const summary = await res.json().catch(() => ({}));
        revalidatePath("/admin/import");
        return { ok: true, summary, overridesSaved: saved };
      }

      return { ok: false, error: `Ukjent source: ${sourceSlug}` };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Ukjent feil" };
    }
  }

  async function deletePreset(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "").trim();
    if (!id) return;
    await prisma.import_presets.delete({ where: { id } });
    revalidatePath("/admin/import");
  }

  return (
    <section className="min-h-screen w-full bg-black text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Admin • Import</h1>
          <p className="mt-2 text-white/70">
            Importer løp fra ulike tidtakingsystemer – og lagre “overstyringer” (navn/dato/distanse/kategori) så du slipper manuell fiks etterpå.
          </p>
        </div>

        {/* ===================== ULTIMATE ===================== */}
        <div className="rounded-2xl border border-white/15 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Ultimate (live.ultimate.dk)</h2>
              <p className="mt-1 text-sm text-white/60">
                Importerer <span className="text-white/80">én distanse</span> per kjøring. For løp med både HM+M: kjør to ganger (f.eks distance=1 og distance=2).
              </p>
            </div>
            <span className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-xs text-white/70">
              source: ultimate
            </span>
          </div>

          <form
            action={async (fd) => {
              "use server";
              const out = await runImport(fd);
              if (!out.ok) throw new Error(out.error);
            }}
            className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2"
          >
            <input type="hidden" name="sourceSlug" value="ultimate" />

            <div>
              <label className="text-sm text-white/70">Event ID</label>
              <input
                name="ult_eventId"
                placeholder="f.eks 6581"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
                required
              />
            </div>

            <div>
              <label className="text-sm text-white/70">Distance ID</label>
              <input
                name="ult_distance"
                placeholder="f.eks 1 (maraton), 2 (halvmaraton)"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
                required
              />
              <div className="mt-1 text-xs text-white/50">Tips: ofte er maraton = 1 og halvmaraton = 2.</div>
            </div>

            <label className="flex items-center gap-2 text-sm text-white/70">
              <input type="checkbox" name="ult_onlyNor" className="h-4 w-4 accent-white" />
              Kun NOR (advanced search)
            </label>

            <div className="hidden md:block" />

            {/* Overrides (optional) */}
            <div className="md:col-span-2 mt-2 rounded-2xl border border-white/10 bg-black/30 p-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-white/80">
                <input type="checkbox" name="override_enabled" className="h-4 w-4 accent-white" />
                Lagre overrides (valgfritt)
              </label>
              <p className="mt-1 text-xs text-white/55">
                Hvis du fyller inn noe under, lagres det som preset for denne event+racedistansen.
              </p>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
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
                    placeholder="Maraton / Halvmaraton / 10 km"
                    className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
                  />
                </div>

                <div>
                  <label className="text-sm text-white/70">distance_m</label>
                  <input
                    name="distance_m"
                    inputMode="numeric"
                    placeholder="42195"
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
              </div>
            </div>

            <div className="md:col-span-2">
              <button className="w-full rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-white/90">
                Importer Ultimate
              </button>
            </div>
          </form>
        </div>

        {/* ===================== RACERESULT ===================== */}
               {/* ===================== RACERESULT ===================== */}
        <div className="mt-8 rounded-2xl border border-white/15 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">RaceResult (my1.raceresult.com)</h2>
              <p className="mt-1 text-sm text-white/60">
                Importerer én liste/contest/filter per kjøring (raceKey blir stabil:{" "}
                <span className="text-white/80">listName|contest|filter</span>).
              </p>
            </div>
            <span className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-xs text-white/70">
              source: raceresult
            </span>
          </div>

          <form
            action={async (fd) => {
              "use server";
              const out = await runImport(fd);
              if (!out.ok) throw new Error(out.error);
            }}
            className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2"
          >
            <input type="hidden" name="sourceSlug" value="raceresult" />

            <div>
              <label className="text-sm text-white/70">Event ID</label>
              <input
                name="rr_eventId"
                placeholder="f.eks 258952"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
                required
              />
            </div>

            <div>
              <label className="text-sm text-white/70">key</label>
              <input
                name="rr_key"
                placeholder="key=..."
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
                required
              />
            </div>

            <div>
              <label className="text-sm text-white/70">listName</label>
              <input
                name="rr_listName"
                defaultValue="Online|Final"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
              />
            </div>

            <div>
              <label className="text-sm text-white/70">contest</label>
              <input
                name="rr_contest"
                defaultValue="0"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-sm text-white/70">filter (valgfritt)</label>
              <input
                name="rr_filter"
                placeholder='f.eks "10 km" eller tom'
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
              />
            </div>

            {/* Overrides (optional) */}
            <div className="md:col-span-2 mt-2 rounded-2xl border border-white/10 bg-black/30 p-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-white/80">
                <input type="checkbox" name="override_enabled" className="h-4 w-4 accent-white" />
                Lagre overrides (valgfritt)
              </label>
              <p className="mt-1 text-xs text-white/55">
                Lagres for denne kombinasjonen (eventId + listName + contest + filter).
              </p>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm text-white/70">Event navn</label>
                  <input
                    name="event_name"
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
                    className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
                  />
                </div>

                <div className="hidden md:block" />

                <div>
                  <label className="text-sm text-white/70">Race navn</label>
                  <input
                    name="race_name"
                    className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
                  />
                </div>

                <div>
                  <label className="text-sm text-white/70">distance_m</label>
                  <input
                    name="distance_m"
                    inputMode="numeric"
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
              </div>
            </div>

            <div className="md:col-span-2">
              <button className="w-full rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-white/90">
                Importer RaceResult
              </button>
            </div>
          </form>
        </div>

        {/* ===================== EQTIMING ===================== */}
        <div className="mt-8 rounded-2xl border border-white/15 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">EQTiming</h2>
              <p className="mt-1 text-sm text-white/60">
                Skriv inn <span className="text-white/80">eventId</span> og trykk import: den kjører{" "}
                <span className="text-white/80">startliste</span> +{" "}
                <span className="text-white/80">resultater (report 347)</span> og matcher via startnummer.
              </p>
            </div>
            <span className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-xs text-white/70">
              source: eqtiming
            </span>
          </div>

          <form
            action={async (fd) => {
              "use server";
              const out = await runImport(fd);
              if (!out.ok) throw new Error(out.error);
            }}
            className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2"
          >
            <input type="hidden" name="sourceSlug" value="eqtiming" />

            <div>
              <label className="text-sm text-white/70">Event ID</label>
              <input
                name="eq_eventId"
                placeholder="f.eks 80410"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
                required
              />
            </div>

            <div className="hidden md:block" />

            {/* Overrides (optional) - event-only */}
            <div className="md:col-span-2 mt-2 rounded-2xl border border-white/10 bg-black/30 p-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-white/80">
                <input type="checkbox" name="override_enabled" className="h-4 w-4 accent-white" />
                Lagre event-override (valgfritt)
              </label>
              <p className="mt-1 text-xs text-white/55">
                Lagres som <span className="text-white/70">event-only</span> preset (raceKey = tom streng).
              </p>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm text-white/70">Event navn</label>
                  <input
                    name="event_name"
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
                    className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
                  />
                </div>

                <div className="hidden md:block" />
              </div>
            </div>

            <div className="md:col-span-2">
              <button className="w-full rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-white/90">
                Importer EQTiming (startliste + resultater)
              </button>
            </div>
          </form>
        </div>

        {/* ===================== PRESETS LIST ===================== */}
        <div className="mt-10 rounded-2xl border border-white/15 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-semibold">Lagrede overrides (presets)</h2>
            <div className="text-sm text-white/60">{presets.length} vist</div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
            <div className="grid grid-cols-12 gap-0 border-b border-white/10 bg-black/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-white/70">
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
                <div className="bg-black/40 px-4 py-6 text-sm text-white/70">Ingen overrides lagret ennå.</div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 text-xs text-white/50">
          Kilder i databasen:{" "}
          {sources.map((s) => (
            <span key={s.id} className="mr-2">
              <span className="text-white/70">{s.slug}</span>
            </span>
          ))}
        </div>
          </div>
    </section>
  );
}