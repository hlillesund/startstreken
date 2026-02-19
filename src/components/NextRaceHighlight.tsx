"use client";

type Race = {
  id: string;
  name: string;
  race_date: string;
  distance_km: number;
  race_type: string;
  logo_url?: string | null;
};

import { useEffect, useState } from "react";
import RaceResultCard from "@/components/RaceResultCard";

export default function NextRaceHighlight({ race }: { race: Race }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    function update() {
      const now = new Date();
      const raceDate = new Date(race.race_date);
      const diff = raceDate.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeLeft("Starter nå");
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);

      setTimeLeft(`${days} dager · ${hours} t · ${minutes} min`);
    }

    update();
    const id = setInterval(update, 60_000); // oppdater hvert minutt
    return () => clearInterval(id);
  }, [race]);

  return (
    <div className="flex flex-col items-center gap-4 mt-5">
      <p className="text-m uppercase tracking-wide text-white/70">
        Neste løp om
      </p>

      <div className="text-2xl font-semibold text-white">
        {timeLeft}
      </div>

      <div className="w-full max-w-md">
        <RaceResultCard race={race} />
      </div>
    </div>
  );
}