"use client";

import Link from "next/link";
import { useState } from "react";

export default function EventsPage() {
  const [query, setQuery] = useState("");

  return (
<div
  className="flex min-h-screen dark:bg-black"
  style={{ paddingTop: "var(--topnav-h)" }}
>      
      {/* FILTER SIDEBAR */}
      <aside className="w-80 shrink-0 border-r glass-card p-6">
        
        {/* Search */}
        <div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Søk etter løp"
            className="w-full rounded-lg border border-black/10 bg-transparent px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-black/20 dark:border-white/10 dark:focus:ring-white/20"
          />
        </div>

        {/* Filters */}
        <div className="mt-8 space-y-6 text-sm">
          
          {/* Distance */}
          <div>
            <h3 className="mb-2 font-medium">Distanse</h3>
            <div className="space-y-1">
              {["5 km", "10 km", "Halvmaraton", "Maraton", "Ultraløp"].map((d) => (
                <label key={d} className="flex items-center gap-2">
                  <input type="checkbox" />
                  {d}
                </label>
              ))}
            </div>
          </div>

          {/* Surface */}
          <div>
            <h3 className="mb-2 font-medium">Underlag</h3>
            <div className="space-y-1">
              {["Asfalt", "Terreng", "Fjell", "Grus"].map((s) => (
                <label key={s} className="flex items-center gap-2">
                  <input type="checkbox" />
                  {s}
                </label>
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <h3 className="mb-2 font-medium">Sted</h3>
            <div className="space-y-1">
              {["Oslo", "Bergen", "Trondheim", "Nord-Norge"].map((l) => (
                <label key={l} className="flex items-center gap-2">
                  <input type="checkbox" />
                  {l}
                </label>
              ))}
            </div>
          </div>

          {/* Other */}
          <div>
            <h3 className="mb-2 font-medium">Annet</h3>
            <div className="space-y-1">
              <label className="flex items-center gap-2">
                <input type="checkbox" />
                Sertifisert løp
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" />
                Familievennlig
              </label>
            </div>
          </div>

        </div>
      </aside>

      {/* RESULTS */}
      <main className="flex-1 p-10">
        <h1 className="mb-6 text-2xl font-semibold">Løp</h1>

        <div className="space-y-4">
          
          {/* Dummy event */}
          <Link
            href="/events/bergen-city-marathon"
            className="block rounded-2xl border border-black/10 bg-white p-6 transition hover:shadow-md dark:border-white/10 dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium">Bergen City Marathon</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Bergen · 27. april 2026 · Maraton
                </p>
              </div>

              <span className="rounded-full border border-black/10 px-3 py-1 text-xs dark:border-white/10">
                Asfalt
              </span>
            </div>
          </Link>

        </div>
      </main>
    </div>
  );
}