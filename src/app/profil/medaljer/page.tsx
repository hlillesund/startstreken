import Image from "next/image";
import { prisma } from "@/lib/prisma";
import MedalCard from "@/components/MedalCard";

export default async function MedalCollectionPage() {
  // Demo: hent Bergen + Oslo Maraton
  const races = await prisma.races.findMany({
    where: {
      name: {
        in: ["Bergen City Marathon", "Oslo Maraton"],
      },
    },
    select: {
      id: true,
      name: true,
      race_date: true,
      distance_km: true,
      logo_url: true,
    },
    orderBy: {
      race_date: "desc",
    },
  });

  // Midlertidige tider (senere kobles dette til user + resultater)
  const medals = races.map((race) => ({
    id: race.id,
    raceName: race.name,
    distance:
      race.distance_km === 42.2
        ? "Maraton · 42,2 km"
        : race.distance_km === 21.1
        ? "Halvmaraton · 21,1 km"
        : `${race.distance_km} km`,
    time:
      race.name === "Bergen City Marathon"
        ? "2:58:41"
        : "1:24:12",
    date: new Date(race.race_date).toLocaleDateString("no-NO", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    logoUrl: race.logo_url,
  }));

  return (
    <section className="relative min-h-screen w-full">
      {/* BACKGROUND IMAGE */}
      <Image
        src="/running1.jpg" // samme bilde som pace/skoguide (kan byttes senere)
        alt="Running background"
        fill
        priority
        className="object-cover"
      />

      {/* DARK OVERLAY */}
      <div className="absolute inset-0 bg-black/55" />

      {/* CONTENT */}
      <div
        className="relative z-10 mx-auto max-w-6xl px-6"
        style={{ paddingTop: "var(--topnav-h)" }}
      >
        {/* HEADER */}
        <div className="pt-24 pb-12 text-white">
          <h1 className="text-3xl font-semibold">
            Medaljesamling
          </h1>
          <p className="mt-2 text-sm text-white/80">
            Dine fullførte løp – samlet på ett sted
          </p>
        </div>

        {/* MEDAL GRID (WHITE CONTEXT) */}
        <div className="mb-32 rounded-2xl bg-white p-6 shadow-2xl">
          {medals.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {medals.map((medal) => (
                <MedalCard
                  key={medal.id}
                  raceName={medal.raceName}
                  distance={medal.distance}
                  time={medal.time}
                  date={medal.date}
                  logoUrl={medal.logoUrl}
                />
              ))}
            </div>
          ) : (
            <div className="text-sm opacity-70">
              Du har ingen medaljer enda.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}