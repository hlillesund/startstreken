"use client";

import Image from "next/image";

type MedalCardProps = {
  raceName: string;
  distance: string;
  time: string;
  date: string;
  logoUrl?: string | null;
};

export default function MedalCard({
  raceName,
  distance,
  time,
  date,
  logoUrl,
}: MedalCardProps) {
  return (
    <div className="solid-card p-4 text-center">
      {/* MEDAL / LOGO */}
      <div className="mx-auto mb-3 h-24 w-24 relative">
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt={raceName}
            fill
            className="object-contain"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs opacity-50">
            Ingen logo
          </div>
        )}
      </div>

      {/* RACE INFO */}
      <h3 className="text-sm font-semibold">
        {raceName}
      </h3>
      <p className="text-xs opacity-70">
        {distance}
      </p>

      {/* TIME */}
      <div className="mt-3 text-xl font-semibold">
        {time}
      </div>

      {/* DATE */}
      <p className="mt-1 text-xs opacity-60">
        {date}
      </p>
    </div>
  );
}