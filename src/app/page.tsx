"use client";

const nextRace: Race = {
  id: "next",
  name: "Bergen City Marathon",
  race_date: "2026-04-27T09:00:00",
  distance_km: 42.2,
  race_type: "Maraton",
  logo_url: null,
};

import NextRaceHighlight from "@/components/NextRaceHighlight";
import ToolCard from "@/components/ToolCard";
import StartnummerCTA from "@/components/StartnummerCTA";
import ToolsQuickActions from "@/components/ToolsQuickActions";
import { useEffect, useRef, useState } from "react";
import SearchBox from "@/components/SearchBox";
import RaceResultCard from "@/components/RaceResultCard";
import { Gauge, Flag, Heart } from "lucide-react";


type Race = {
  id: string;
  name: string;
  race_date: string;
  distance_km: number;
  race_type: string;
  logo_url?: string | null;
};

export default function Home() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Race[]>([]);
  const [searching, setSearching] = useState(false);

  // Mobile full-screen search
  const [searchOpen, setSearchOpen] = useState(false);

  /* =====================
     JOURNEY OBSERVER
  ===================== */
  useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 }
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  /* =====================
     LIVE SEARCH (RACE NAME)
  ===================== */
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/races/by-name?q=${encodeURIComponent(q)}`,
          { signal: controller.signal }
        );
        if (!res.ok) return;
        const data = await res.json();
        setResults(data);
      } catch {}
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [query]);

  /* =====================
     SUBMIT SEARCH
  ===================== */
  async function handleSubmit() {
    const q = query.trim();
    if (!q) return;

    setSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&radius=100`);
      const data = await res.json();

      if (data?.races?.length) {
        setResults(data.races);
      } else {
        const fallback = await fetch(
          `/api/races/by-name?q=${encodeURIComponent(q)}`
        );
        setResults(await fallback.json());
      }
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }




  return (
    <div className="w-full">
      {/* =====================
          HERO
      ===================== */}
      <section className="relative w-full hero">
        <video
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
        >
          <source
            src="https://copenhagenmarathon.dk/wp-content/uploads/2025/06/CPH_MARATHON_PAID_2025_16x9_CLEAN_Notextorlogo-1.mp4"
            type="video/mp4"
          />
        </video>

        <div className="absolute inset-0 bg-black/35" />

        <div className="relative z-10 flex min-h-full items-start justify-center px-6 hero-content">
          <div className="w-full max-w-3xl text-center">
            <h1 className="text-6xl font-semibold tracking-tight text-white sm:text-5xl md:text-6xl">
              Startstreken
            </h1>

            <p className="mt-6 text-lg leading-8 text-white/90">
              Oversikt over løpsarrangementer, nyheter fra løpsuniverset, utstyrsguide og personlig oversikt – samlet på ett sted.
            </p>

            {/* SEARCH */}
          
  <div className="mt-8 mx-auto w-full max-w-[520px] relative">
  {/* Mobile click-catcher */}
  <button
  type="button"
  className="absolute inset-0 z-10 md:hidden"
  aria-label="Åpne søk"
  onClick={() => {
    setSearchOpen(true);

    // iOS requires focus to be synchronous with the click
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }}
/>

  <SearchBox
    variant="light"
    placeholder="Søk etter sted eller løp"
    value={query}
    onChange={setQuery}
    onSubmit={handleSubmit}
  />


              {/* DESKTOP LIVE RESULTS */}
              {results.length > 0 && !searchOpen && (
                <div className="mt-5 mb-5 grid gap-3 text-left">
                  {results.map((race) => (
                    <RaceResultCard key={race.id} race={race} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

   {/* =====================
    MOBILE SEARCH (FIXED OVERLAY — iOS SAFE)
===================== */}
{searchOpen && (
  <div
    className="fixed inset-0 z-[9999] bg-white md:hidden flex flex-col
               transform transition-transform duration-300 ease-in-out translate-x-0"
    style={{ height: "100dvh" }} // critical for iOS Safari
  >
        {/* TOP BAR */}
        <div className="sticky top-0 z-10 border-b bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <button
  onClick={() => {
    setSearchOpen(false);
    setQuery("");
    setResults([]);
  }}
  className="text-xl font-semibold"
>
  ←
</button>

            <div className="flex-1">
              <SearchBox
                variant="dark"
                ref={inputRef}
                placeholder="Søk etter sted eller løp"
                value={query}
                onChange={setQuery}
                onSubmit={handleSubmit}
              />
            </div>
          </div>
        </div>

        {/* FILTERS */}
        <div className="border-b px-4 py-3">
          <div className="flex gap-2 overflow-x-auto">
            <button className="rounded-full border px-4 py-2 text-sm">5–10 km</button>
            <button className="rounded-full border px-4 py-2 text-sm">Halv</button>
            <button className="rounded-full border px-4 py-2 text-sm">Maraton</button>
            <button className="rounded-full border px-4 py-2 text-sm">Terreng</button>
          </div>
        </div>

        {/* RESULTS */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {searching && <div className="text-sm text-gray-500">Søker…</div>}

          {results.length > 0 && (
            <div className="grid gap-3">
              {results.map((race) => (
                <RaceResultCard
                  key={race.id}
                  race={race}
                  variant="light"
                />
              ))}
            </div>
          )}
        </div>
      </div>)}

    {/* =====================
    VERKTØY
===================== */}
<section className="bg-white">
  <div className="mx-auto max-w-6xl px-6 py-10">

    <div className="mb-6">
      <h2 className="text-xl font-semibold">
        Verktøy for løpere
      </h2>
      <p className="mt-2 text-sm opacity-70">
        Kalkulatorer og verktøy du bruker ofte
      </p>
    </div>

    {/* 
      MOBIL (default): vertikal
      DESKTOP (md+): horisontal
    */}
    <div className="flex flex-col gap-4 md:flex-row">
      <ToolCard
        title="Pace-kalkulator"
        description="Regn ut tempo, tid og distanse"
        icon={<Gauge className="h-6 w-6" />}
        href="/verktoy/pace-kalkulator"
      />

      <ToolCard
        title="Estimer løpstider"
        description="Hva er du god for på ulike distanser?"
        icon={<Flag className="h-6 w-6" />}
        href="/verktoy/pace-kalkulator"
      />

      <ToolCard
        title="Treningssoner"
        description="Finn riktige soner for fart og puls"
        icon={<Heart className="h-6 w-6" />}
        href="/verktoy/pace-kalkulator"
      />
    </div>

  </div>
</section>

<StartnummerCTA />
      
      {/* =====================
          LIST SECTIONS
      ===================== */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="grid gap-8 md:grid-cols-2">
            <div className="glass-card p-6">
              <h2 className="mb-4 text-xl font-semibold">Kommende løp</h2>
              <ul className="space-y-3 text-sm">
                <li>Bergen City Marathon – 27. april</li>
                <li>Oslo Spring Run – 4. mai</li>
                <li>Lofoten Ultra-Trail – 18. mai</li>
              </ul>
            </div>

            <div className="glass-card p-6">
              <h2 className="mb-4 text-xl font-semibold">Mest populære</h2>
              <ul className="space-y-3 text-sm">
                <li>Oslo Maraton – 15 000+</li>
                <li>Birkebeinerløpet – 10 000+</li>
                <li>Sentrumsløpet – 8 000+</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}