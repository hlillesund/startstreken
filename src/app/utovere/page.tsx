"use client";

import Image from "next/image";
import React, { useEffect, useMemo, useState } from "react";

type AthleteHit = {
  id: string;
  display_name: string;
};

type AthleteResultRow = {
  start_date: string | null; // "YYYY-MM-DD" eller null
  event_name: string;
  race_name: string;
  time_ms: number;
};

function formatTime(ms: number) {
  const totalSeconds = Math.round(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export default function UtoverePage() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<AthleteHit[]>([]);
  const [loadingHits, setLoadingHits] = useState(false);

  const [selected, setSelected] = useState<AthleteHit | null>(null);
  const [results, setResults] = useState<AthleteResultRow[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);

  const canSearch = q.trim().length >= 2;

  // Debounce søk
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;

    if (!canSearch) {
      setHits([]);
      setLoadingHits(false);
      return;
    }

    setLoadingHits(true);
    t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/athletes/search?q=${encodeURIComponent(q.trim())}`);
        const data = (await res.json()) as AthleteHit[];
        setHits(Array.isArray(data) ? data : []);
      } catch {
        setHits([]);
      } finally {
        setLoadingHits(false);
      }
    }, 250);

    return () => {
      if (t) clearTimeout(t);
    };
  }, [q, canSearch]);

  async function loadResults(athlete: AthleteHit) {
    setSelected(athlete);
    setLoadingResults(true);
    setResults([]);

    // 1) refresh EQTiming (hvis identity finnes server-side)
    try {
      await fetch(`/api/athletes/${athlete.id}/refresh-eqtiming`, { method: "POST" });
    } catch {
      // ignore
    }

    // 2) hent resultater
    try {
      const res = await fetch(`/api/athletes/${athlete.id}/results`);
      const data = (await res.json()) as AthleteResultRow[];
      setResults(Array.isArray(data) ? data : []);
    } catch {
      setResults([]);
    } finally {
      setLoadingResults(false);
    }
  }

  const title = useMemo(() => {
    if (!selected) return "Utøvere";
    return `Resultater: ${selected.display_name}`;
  }, [selected]);

  return (
    <section className="relative min-h-screen w-full">
      {/* BACKGROUND IMAGE */}
      <Image
        src="/running1.jpg"
        alt="Running background"
        fill
        priority
        className="object-cover"
      />

      {/* DARK OVERLAY */}
      <div className="absolute inset-0 bg-black/55" />

      {/* CONTENT */}
      <div
        className="relative z-10 mx-auto max-w-5xl px-6"
        style={{ paddingTop: "var(--topnav-h)" }}
      >
        {/* HERO */}
        <div className="pt-24 pb-12 text-center text-white">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 text-lg text-white/85">
            Søk etter en utøver og se resultater på tvers av løp.
          </p>

          {/* SEARCH (samme vibe som skoguide) */}
          <div className="mx-auto mt-8 max-w-md">
            <input
              className="w-full rounded-full border border-white/20 bg-white/10 px-5 py-3 text-white placeholder:text-white/60 outline-none backdrop-blur-md transition focus:border-white/40"
              placeholder="Søk utøver (min. 2 tegn)…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="mt-3 text-sm text-white/70">
              {loadingHits ? "Søker…" : canSearch ? `${hits.length} treff` : "Skriv minst 2 tegn"}
            </div>
          </div>
        </div>

        {/* MAIN WHITE CARD */}
        <div className="mx-auto mb-32 mt-4 max-w-4xl rounded-2xl bg-white p-6 sm:p-12 text-black shadow-2xl transition-all">
          {/* Treffliste */}
          {hits.length > 0 && (
            <div className="rounded-2xl border p-2">
              {hits.map((h) => (
                <button
                  key={h.id}
                  onClick={() => loadResults(h)}
                  className={`w-full rounded-xl px-4 py-3 text-left transition hover:bg-black/5 ${
                    selected?.id === h.id ? "bg-black/5" : ""
                  }`}
                >
                  <div className="font-medium">{h.display_name}</div>
                  <div className="text-xs text-zinc-500">Klikk for å hente/oppdatere resultater</div>
                </button>
              ))}
            </div>
          )}

          {/* Empty state når ingen treff */}
          {!loadingHits && canSearch && hits.length === 0 && (
            <div className="rounded-2xl border border-black/10 p-6 text-sm text-zinc-600">
              Ingen treff. (Tips: prøv færre ord eller bare etternavn.)
            </div>
          )}

          {/* Resultater */}
          {selected && (
            <div className="mt-10">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-zinc-600">Resultater</div>
                  <div className="text-2xl font-semibold">{selected.display_name}</div>
                </div>

                <button
                  onClick={() => loadResults(selected)}
                  disabled={loadingResults}
                  className="rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {loadingResults ? "Oppdaterer…" : "Oppdater fra EQTiming"}
                </button>
              </div>

              {loadingResults && (
                <div className="mt-3 text-sm text-zinc-600">Laster resultater…</div>
              )}

              {!loadingResults && results.length === 0 && (
                <div className="mt-4 rounded-2xl border border-black/10 p-6 text-sm text-zinc-600">
                  Ingen resultater lagret for denne utøveren ennå.
                </div>
              )}

              {!loadingResults && results.length > 0 && (
                <div className="mt-6 overflow-hidden rounded-2xl border">
                  <div className="grid grid-cols-12 gap-0 border-b bg-black/5 px-4 py-2 text-xs font-semibold">
                    <div className="col-span-2">Dato</div>
                    <div className="col-span-6">Løp</div>
                    <div className="col-span-2">Distanse</div>
                    <div className="col-span-2 text-right">Tid</div>
                  </div>

                  {results.map((r, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-0 border-b px-4 py-3 text-sm last:border-b-0"
                    >
                      <div className="col-span-2 opacity-80">{r.start_date ?? "-"}</div>
                      <div className="col-span-6">{r.event_name}</div>
                      <div className="col-span-2 opacity-80">{r.race_name}</div>
                      <div className="col-span-2 text-right font-medium">
                        {formatTime(r.time_ms)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Hint når ingenting er valgt enda */}
          {!selected && (
            <div className="mt-2 text-center text-zinc-600">
              <div className="text-lg font-medium">Søk etter en utøver</div>
              <p className="mt-2 text-sm">
                Skriv minst 2 tegn i søkefeltet over, og klikk på et treff for å se resultater.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}