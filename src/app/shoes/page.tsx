"use client";

import Image from "next/image";
import { useState } from "react";
import SearchBox from "@/components/SearchBox";

type Step =
  | "intro"
  | "surface"
  | "usage"
  | "pace"
  | "distance"
  | "feel"
  | "results";

export default function ShoeGuidePage() {
  const [step, setStep] = useState<Step>("intro");

  const [query, setQuery] = useState("");

  const [surface, setSurface] = useState<string | null>(null);
  const [usage, setUsage] = useState<string | null>(null);
  const [pace, setPace] = useState(245);
  const [distance, setDistance] = useState(10);
  const [feel, setFeel] = useState<string | null>(null);

  function next(nextStep: Step) {
    setStep((current) => (current === nextStep ? current : nextStep));
  }

  return (
    <section className="relative min-h-screen w-full">
      {/* BACKGROUND IMAGE */}
      <Image
        src="/running1.jpg" // ← legg bildet her
        alt="Running shoes background"
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
        {/* HERO HEADER */}
        <div className="pt-24 pb-16 text-center text-white">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Skoguide
          </h1>
          <p className="mt-4 text-lg text-white/85">
            Et presist verktøy for å finne riktige løpesko – basert på hvordan du faktisk løper.
          </p>

          {/* SEARCH */}
          <div className="mx-auto max-w-md">
            <SearchBox
  variant="light"
  placeholder="Søk direkte etter sko (modell eller merke)"
  value={query}
  onChange={setQuery}
  onSubmit={() => {}}
/>
          </div>
        </div>

        {/* MAIN WHITE CARD */}
        <div className="mx-auto mb-32 mt-15 max-w-4xl rounded-2xl bg-white p-12 text-black shadow-2xl transition-all">
          {/* INTRO */}
          {step === "intro" && (
            <div className="text-center">
              <h2 className="text-2xl font-semibold">
                Få anbefalt sko
              </h2>
              <p className="mt-4 text-zinc-600">
                Svar på noen få spørsmål, så foreslår vi skotyper som passer
                måten du løper på.
              </p>

              <button
                onClick={() => next("surface")}
                className="mt-10 rounded-full bg-black px-12 py-3 text-white transition hover:opacity-90"
              >
                Start
              </button>
            </div>
          )}

          {/* SURFACE */}
          {step === "surface" && (
            <>
              <h2 className="mb-8 text-xl font-medium">Underlag</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {["Asfalt", "Terreng"].map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setSurface(s);
                      next("usage");
                    }}
                    className="h-28 rounded-xl border border-black/10 text-lg transition hover:border-black/30"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* USAGE */}
          {step === "usage" && (
            <>
              <h2 className="mb-8 text-xl font-medium">Hovedbruk</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                {["Rolige turer", "Tempo / intervall", "Konkurranse"].map((u) => (
                  <button
                    key={u}
                    onClick={() => {
                      setUsage(u);
                      next("pace");
                    }}
                    className="h-28 rounded-xl border border-black/10 text-lg transition hover:border-black/30"
                  >
                    {u}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* PACE */}
          {step === "pace" && (
            <>
              <h2 className="mb-4 text-xl font-medium">Tempo</h2>
              <div className="mb-6 text-lg">
                {Math.floor(pace / 60)}:
                {(pace % 60).toString().padStart(2, "0")} min/km
              </div>
              <input
                type="range"
                min={180}
                max={420}
                step={5}
                value={pace}
                onChange={(e) => setPace(Number(e.target.value))}
                onMouseUp={() => next("distance")}
                className="w-full"
              />
            </>
          )}

          {/* DISTANCE */}
          {step === "distance" && (
            <>
              <h2 className="mb-4 text-xl font-medium">Typisk lengde</h2>
              <div className="mb-6 text-lg">{distance} km</div>
              <input
                type="range"
                min={5}
                max={42}
                step={1}
                value={distance}
                onChange={(e) => setDistance(Number(e.target.value))}
                onMouseUp={() => next("feel")}
                className="w-full"
              />
            </>
          )}

          {/* FEEL */}
          {step === "feel" && (
            <>
              <h2 className="mb-8 text-xl font-medium">Følelse</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                {["Myk", "Fast", "Nøytral"].map((f) => (
                  <button
                    key={f}
                    onClick={() => {
                      setFeel(f);
                      next("results");
                    }}
                    className="h-28 rounded-xl border border-black/10 text-lg transition hover:border-black/30"
                  >
                    {f}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* RESULTS */}
          {step === "results" && (
            <>
              <h2 className="mb-8 text-xl font-medium">
                Foreslåtte skotyper
              </h2>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="rounded-xl border border-black/10 p-6">
                  <div className="text-lg font-medium">Tempo-sko</div>
                  <p className="mt-2 text-sm text-zinc-600">
                    Asfalt · tempoøkter · 8–15 km
                  </p>
                </div>

                <div className="rounded-xl border border-black/10 p-6">
                  <div className="text-lg font-medium">
                    Allround treningssko
                  </div>
                  <p className="mt-2 text-sm text-zinc-600">
                    Mengde · rolige turer · variert bruk
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}