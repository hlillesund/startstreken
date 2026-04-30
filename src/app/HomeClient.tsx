"use client";

import React, { useEffect, useRef, useState } from "react";
import SearchBox from "@/components/SearchBox";
import RaceResultCard from "@/components/RaceResultCard";
import StartnummerCTA from "@/components/StartnummerCTA";
import { Gauge, Flag, Heart, Users } from "lucide-react";

type Race = {
  id: string;
  name: string;
  race_date: string;
  distance_km: number;
  race_type: string;
  logo_url?: string | null;
};

function ToolTile({
  title,
  description,
  icon,
  href,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
}) {
  return (
    <a className="cpn-tile" href={href}>
      <div className="cpn-tile-top">
        <div className="cpn-tile-icon">{icon}</div>
        <div className="cpn-tile-title">{title}</div>
      </div>
      <div className="cpn-tile-desc">{description}</div>
      <div className="cpn-tile-cta">Åpne →</div>
    </a>
  );
}

export default function HomeClient() {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Race[]>([]);
  const [searching, setSearching] = useState(false);

  // Mobile full-screen search
  const [searchOpen, setSearchOpen] = useState(false);

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
        const res = await fetch(`/api/races/by-name?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
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
        const fallback = await fetch(`/api/races/by-name?q=${encodeURIComponent(q)}`);
        setResults(await fallback.json());
      }
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  const year = new Date().getFullYear();

  return (
    <div className="cpn-root cpn-home" style={{ paddingTop: "var(--topnav-h)" }}>
      {/* Header strip (samme som utøvere) */}
      
      <header className="cpn-header">
        <meta name="google-adsense-account" content="ca-pub-7553946899442750"></meta>

        <span className="cpn-logo">Startstreken</span>
        <span className="cpn-header-right">{year} Season</span>
      </header>

     {/* =====================
    HERO (VIDEO BACKGROUND, TEXT ON TOP)
===================== */}
<section className="cpn-hero-video">
  <video className="cpn-hero-video-el" autoPlay muted loop playsInline preload="auto">
    <source
      src="https://copenhagenmarathon.dk/wp-content/uploads/2025/06/CPH_MARATHON_PAID_2025_16x9_CLEAN_Notextorlogo-1.mp4"
      type="video/mp4"
    />
  </video>

  <div className="cpn-hero-video-overlay" />

  <div className="cpn-hero-video-content">
    <div className="cpn-hero-video-inner">
      <div className="cpn-hero-eyebrow" style={{ color: "rgba(255,255,255,0.65)" }}>
        Database / Profiler / Rangering
      </div>

      <h1 className="cpn-hero-video-title">Startstreken.</h1>

      <p className="cpn-hero-video-desc">
        Finn utøvere, se personlige rekorder, ranking og utvikling. Løpssøk kommer.
      </p>

      <div className="cpn-hero-actions">
        <a className="cpn-hero-action" href="/utovere">
          <div className="cpn-hero-action-top">
            <span className="cpn-hero-action-label">Utøvere</span>
            <span className="cpn-hero-action-arrow">→</span>
          </div>
          <div className="cpn-hero-action-desc">PB · ranking · grafer · profiler</div>
        </a>

         <a className="cpn-hero-action" href="/lop">
          <div className="cpn-hero-action-top">
            <span className="cpn-hero-action-label">Løp</span>
            <span className="cpn-hero-action-arrow">→</span>
          </div>
          <div className="cpn-hero-action-desc">Se hvilke løp i Norge som er raskest</div>
        </a>

        
        
      </div>
    </div>
  </div>
</section>

      {/* =====================
          MOBILE SEARCH OVERLAY (løpssøk)
      ===================== */}
      {searchOpen && (
        <div className="cpn-mobile-overlay md:hidden" style={{ height: "100dvh" }}>
          <div className="cpn-mobile-topbar">
            <div className="cpn-mobile-topbar-row">
              <button
                onClick={() => {
                  setSearchOpen(false);
                  setQuery("");
                  setResults([]);
                }}
                className="cpn-mobile-back"
                aria-label="Lukk søk"
              >
                ←
              </button>

              <div className="cpn-mobile-searchwrap">
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

          <div className="cpn-mobile-filters">
            <div className="cpn-mobile-filterrow">
              <button className="cpn-pill">5–10 km</button>
              <button className="cpn-pill">Halv</button>
              <button className="cpn-pill">Maraton</button>
              <button className="cpn-pill">Terreng</button>
            </div>
          </div>

          <div className="cpn-mobile-results">
            {searching && <div className="cpn-empty" style={{ padding: 0 }}>Søker…</div>}

            {results.length > 0 ? (
              <div className="cpn-mobile-resultsgrid">
                {results.map((race) => (
                  <RaceResultCard key={race.id} race={race} variant="light" />
                ))}
              </div>
            ) : (
              <div className="cpn-empty" style={{ padding: 0 }}>Søk for å se treff.</div>
            )}
          </div>
        </div>
      )}

      {/* =====================
          VERKTØY (samme “boks”-design)
      ===================== */}
      <section className="cpn-home-section">
        <div className="cpn-home-section-head">
          <div>
            <div className="cpn-section-label" style={{ marginBottom: 10 }}>Verktøy</div>
            <h2 className="cpn-home-h2">Verktøy for løpere</h2>
            <p className="cpn-home-p">Kalkulatorer og verktøy du bruker ofte.</p>
          </div>
         
        </div>

        <div className="cpn-tiles">
          <ToolTile
            title="Pace-kalkulator"
            description="Regn ut tempo, tid og distanse"
            icon={<Gauge className="h-5 w-5" />}
            href="/verktoy/pace-kalkulator"
          />
          <ToolTile
            title="Estimer løpstider og treningssoner"
            description="Finn løps- og treningsfart med pulssoner"
            icon={<Flag className="h-5 w-5" />}
            href="/verktoy/predictor"
          />
        </div>
      </section>

 

     
      <div style={{ height: 24 }} />
    </div>
  );
}