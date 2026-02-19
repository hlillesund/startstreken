"use client";

import Image from "next/image";
import PaceCalculator from "@/components/PaceCalculator";

export default function PaceKalkulatorPage() {
  return (
    <section className="relative min-h-screen w-full">
      {/* BACKGROUND IMAGE */}
      <Image
        src="/pace.webp"   // kan byttes senere
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
        {/* HEADER */}
        <div className="pt-24 pb-12 text-center text-white">
          <h1 className="text-4xl font-semibold tracking-tight">
            Pace-kalkulator
          </h1>
          <p className="mt-4 text-lg text-white/85">
            Finn hvilken fart du må holde for å nå målet ditt
          </p>
        </div>

        {/* MAIN WHITE / GLASS CARD */}
        <div className="mx-auto mb-32 max-w-md">
          <PaceCalculator />
        </div>
      </div>
    </section>
  );
}