"use client";

import React, { useMemo } from "react";
import type { DistanceCategory } from "@/components/utovere/types";

type UpcomingRace = {
  id: string;
  title: string;
  date: string; // "YYYY-MM-DD" eller fri tekst
  location?: string;
  category: Exclude<DistanceCategory, "OTHER">;
  href: string; // påmelding/info
};

const CATS: { key: Exclude<DistanceCategory, "OTHER">; long: string }[] = [
  { key: "5K", long: "5 Kilometer" },
  { key: "10K", long: "10 Kilometer" },
  { key: "HM", long: "Halvmaraton" },
  { key: "M", long: "Maraton" },
];

export default function UpcomingRacesPlaceholder() {
  // Placeholderdata – bytt senere til fetch fra API når du har
  const races: UpcomingRace[] = useMemo(
    () => [
      { id: "r1", title: "Vårjogg 5K", date: "2026-04-12", location: "Bergen", category: "5K", href: "#" },
      { id: "r2", title: "Byløpet 10K", date: "2026-05-03", location: "Oslo", category: "10K", href: "#" },
      { id: "r3", title: "Fjord Halv", date: "2026-05-24", location: "Stavanger", category: "HM", href: "#" },
      { id: "r4", title: "Maratonhelg", date: "2026-06-14", location: "Trondheim", category: "M", href: "#" },
    ],
    []
  );

  return (
    <section className="cpn-upcoming">
      <div className="cpn-upcoming-head">
        <div className="cpn-section-label" style={{ marginBottom: 0 }}>
          Kommende løp (placeholder)
        </div>
        <div className="cpn-upcoming-sub">Klikk for påmelding / mer info</div>
      </div>

      <div className="cpn-upcoming-grid">
        {CATS.map((c) => {
          const list = races.filter((r) => r.category === c.key).slice(0, 3);
          return (
            <div key={c.key} className="cpn-upcoming-col">
              <div className="cpn-upcoming-coltitle">{c.long}</div>

              {list.length === 0 && <div className="cpn-upcoming-empty">Ingen løp lagt inn</div>}

              {list.map((r) => (
                <a key={r.id} className="cpn-upcoming-card" href={r.href}>
                  <div className="cpn-upcoming-title">{r.title}</div>
                  <div className="cpn-upcoming-meta">
                    <span>{r.date}</span>
                    {r.location ? <span> · {r.location}</span> : null}
                  </div>
                  <div className="cpn-upcoming-cta">Se / meld på →</div>
                </a>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}