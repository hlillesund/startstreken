"use client";

import Image from "next/image";

type Race = {
  id: string;
  name: string;
  race_date: string;
  distance_km: number;
  race_type: string;
  logo_url?: string | null;
};

export default function RaceResultCard({
  race,
  variant = "dark",
}: {
  race: Race;
  variant?: "dark" | "light";
}) {
  return (
    <div
      className={`glass-card flex items-center gap-4 p-4 ${
        variant === "light" ? "text-black" : "text-white"
      }`}
    >
      {/* LOGO */}
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-white">
        {race.logo_url ? (
          <Image
            src={race.logo_url}
            alt={`${race.name} logo`}
            fill
            className="object-contain"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
            Logo
          </div>
        )}
      </div>

      {/* INFO */}
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-semibold">{race.name}</h3>
        <p className="text-sm opacity-80">
          {new Date(race.race_date).toLocaleDateString("no-NO")} ·{" "}
          {race.distance_km} km · {race.race_type}
        </p>
      </div>

      {/* CTA */}
      <button className="shrink-0 rounded-lg border border-white/30 px-4 py-2 text-sm hover:bg-white/10">
        Se løp
      </button>
    </div>
  );
}