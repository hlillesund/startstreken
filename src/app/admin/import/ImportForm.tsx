// src/app/admin/import/ImportForm.tsx
"use client";

import React, { useMemo, useState } from "react";

type Source = { id: string; slug: string; name: string };

type DistanceCategory = "5K" | "10K" | "HM" | "M" | "OTHER";

const CATEGORIES: { key: DistanceCategory; label: string }[] = [
  { key: "5K", label: "5K" },
  { key: "10K", label: "10K" },
  { key: "HM", label: "HM" },
  { key: "M", label: "M" },
  { key: "OTHER", label: "OTHER" },
];

export default function ImportForm({ sources }: { sources: Source[] }) {
  const [sourceSlug, setSourceSlug] = useState(sources[0]?.slug ?? "eqtiming");

  // --- Common overrides ---
  const [eventName, setEventName] = useState("");
  const [startDate, setStartDate] = useState(""); // yyyy-mm-dd
  const [location, setLocation] = useState("");
  const [raceName, setRaceName] = useState("");
  const [distanceM, setDistanceM] = useState<string>("");
  const [distanceCategory, setDistanceCategory] = useState<string>("");

  // --- EQTiming ---
  const [eqEventId, setEqEventId] = useState("");

  // --- Ultimate ---
  const [ultimateMode, setUltimateMode] = useState<"NOR" | "SWE" | "DEN">("NOR");
  const [ultimateEventId, setUltimateEventId] = useState("");
  const [ultimateDistance, setUltimateDistance] = useState<string>(""); // optional

  // --- RaceResult ---
  const [rrEventId, setRrEventId] = useState("");
  const [rrKey, setRrKey] = useState("");
  const [rrListName, setRrListName] = useState("Online|Final");
  const [rrContest, setRrContest] = useState("0");
  const [rrFilter, setRrFilter] = useState("10 km");

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const sourceHelp = useMemo(() => {
    if (sourceSlug === "eqtiming") return "EQTiming trenger eventId (ArrangementUID).";
    if (sourceSlug === "ultimate") return "Ultimate trenger mode + eventId. Distance er valgfritt.";
    if (sourceSlug === "raceresult") return "RaceResult trenger eventId + key + listName + contest + filter.";
    return "";
  }, [sourceSlug]);

  async function submit() {
    setBusy(true);
    setErr(null);
    setResult(null);

    const override = {
      event_name: eventName.trim() || null,
      start_date: startDate.trim() || null,
      location: location.trim() || null,
      race_name: raceName.trim() || null,
      distance_m: distanceM.trim() ? Number(distanceM.trim()) : null,
      distance_category:
        (["5K", "10K", "HM", "M", "OTHER"].includes(distanceCategory)
          ? distanceCategory
          : null) ?? null,
    };

    // basic validation for distance_m
    if (override.distance_m !== null && !Number.isFinite(override.distance_m)) {
      setBusy(false);
      setErr("distance_m må være et tall.");
      return;
    }

    // build source-specific params
    let params: any = {};

    if (sourceSlug === "eqtiming") {
      params = { eventId: Number(eqEventId) };
    } else if (sourceSlug === "ultimate") {
      params = {
        mode: ultimateMode,
        eventId: Number(ultimateEventId),
        distance: ultimateDistance.trim() ? Number(ultimateDistance.trim()) : null,
      };
    } else if (sourceSlug === "raceresult") {
      params = {
        eventId: Number(rrEventId),
        key: rrKey.trim(),
        listName: rrListName.trim(),
        contest: Number(rrContest),
        filter: rrFilter.trim(),
      };
    }

    try {
      const res = await fetch("/api/admin/import-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceSlug, params, override }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? data?.message ?? "Import feilet");

      setResult(data);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/15 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
      <div className="flex flex-col gap-1">
        <div className="text-lg font-semibold">Importer løp</div>
        <div className="text-sm text-white/60">{sourceHelp}</div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="text-sm text-white/70">Kilde (tidsystem)</label>
          <select
            value={sourceSlug}
            onChange={(e) => setSourceSlug(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none"
          >
            {sources.map((s) => (
              <option key={s.id} value={s.slug}>
                {s.slug} — {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Source-specific fields */}
        {sourceSlug === "eqtiming" && (
          <div>
            <label className="text-sm text-white/70">EQTiming eventId</label>
            <input
              value={eqEventId}
              onChange={(e) => setEqEventId(e.target.value)}
              placeholder="f.eks 123456"
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
            />
          </div>
        )}

        {sourceSlug === "ultimate" && (
          <>
            <div>
              <label className="text-sm text-white/70">Ultimate mode</label>
              <select
                value={ultimateMode}
                onChange={(e) => setUltimateMode(e.target.value as any)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none"
              >
                <option value="NOR">NOR</option>
                <option value="SWE">SWE</option>
                <option value="DEN">DEN</option>
              </select>
            </div>

            <div>
              <label className="text-sm text-white/70">Ultimate eventId</label>
              <input
                value={ultimateEventId}
                onChange={(e) => setUltimateEventId(e.target.value)}
                placeholder="f.eks 6277"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-sm text-white/70">Ultimate distance (valgfritt)</label>
              <input
                value={ultimateDistance}
                onChange={(e) => setUltimateDistance(e.target.value)}
                placeholder="f.eks 1 (km), 5, 10, 21..."
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
              />
              <div className="mt-1 text-xs text-white/50">
                Hvis du lar den stå tom, bruker importeren default-oppsettet ditt.
              </div>
            </div>
          </>
        )}

        {sourceSlug === "raceresult" && (
          <>
            <div>
              <label className="text-sm text-white/70">RaceResult eventId</label>
              <input
                value={rrEventId}
                onChange={(e) => setRrEventId(e.target.value)}
                placeholder="f.eks 258952"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
              />
            </div>

            <div>
              <label className="text-sm text-white/70">key</label>
              <input
                value={rrKey}
                onChange={(e) => setRrKey(e.target.value)}
                placeholder="api key"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
              />
            </div>

            <div>
              <label className="text-sm text-white/70">listName</label>
              <input
                value={rrListName}
                onChange={(e) => setRrListName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none"
              />
            </div>

            <div>
              <label className="text-sm text-white/70">contest</label>
              <input
                value={rrContest}
                onChange={(e) => setRrContest(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-sm text-white/70">filter</label>
              <input
                value={rrFilter}
                onChange={(e) => setRrFilter(e.target.value)}
                placeholder="f.eks 10 km"
                className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
              />
            </div>
          </>
        )}
      </div>

      {/* Overrides */}
      <div className="mt-7 rounded-2xl border border-white/10 bg-black/30 p-5">
        <div className="text-sm font-semibold">Overstyringer (valgfritt)</div>
        <div className="mt-1 text-xs text-white/55">
          Fyll inn det du vil overstyre. Tomme felt ignoreres.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm text-white/70">Event navn</label>
            <input
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="Sommernattsløpet 2024"
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
            />
          </div>

          <div>
            <label className="text-sm text-white/70">Startdato</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none"
            />
          </div>

          <div>
            <label className="text-sm text-white/70">Sted</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Bergen"
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
            />
          </div>

          <div className="hidden md:block" />

          <div>
            <label className="text-sm text-white/70">Race navn</label>
            <input
              value={raceName}
              onChange={(e) => setRaceName(e.target.value)}
              placeholder="10 km"
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
            />
          </div>

          <div>
            <label className="text-sm text-white/70">distance_m</label>
            <input
              value={distanceM}
              onChange={(e) => setDistanceM(e.target.value)}
              inputMode="numeric"
              placeholder="10000"
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none placeholder:text-white/40"
            />
          </div>

          <div>
            <label className="text-sm text-white/70">distance_category</label>
            <select
              value={distanceCategory}
              onChange={(e) => setDistanceCategory(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-white outline-none"
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
            <button
              onClick={submit}
              disabled={busy}
              className="w-full rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-white/90 disabled:opacity-60"
            >
              {busy ? "Importer…" : "Importer nå"}
            </button>
          </div>
        </div>
      </div>

      {/* Status */}
      <div className="mt-4">
        {err && (
          <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {err}
          </div>
        )}

        {result && (
          <pre className="mt-3 overflow-auto rounded-xl border border-white/15 bg-black/40 p-4 text-xs text-white/80">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}