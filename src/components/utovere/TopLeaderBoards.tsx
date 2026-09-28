"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { MAIN_DISTANCES, formatTime } from "./utils";
import type { AthleteHit } from "./types";

type Entry = {
  athlete_id: string;
  display_name: string;
  best_time_ms: number;
  rank: number;
  club?: string;
  event_name?: string;
};
type CategoryData = { M: Entry[]; F: Entry[] };
type LeaderboardData = Record<string, CategoryData>;

interface Props {
  year: number;
  onSelectAthlete?: (athlete: AthleteHit) => void;
  title?: string;
}

export default function TopLeaderboards({ year, onSelectAthlete, title }: Props) {
  const [res, setRes] = useState<{ year: number; data: LeaderboardData | null } | null>(null);
  const [category, setCategory] = useState<string>("HM");
  const [gender, setGender] = useState<"M" | "F">("M");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/leaderboards?year=${year}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setRes({ year, data: d?.ok ? d.results : null }))
      .catch(() => !cancelled && setRes({ year, data: null }));
    return () => {
      cancelled = true;
    };
  }, [year]);

  const loading = res?.year !== year;
  const failed = !loading && !res?.data;
  const catData = loading ? undefined : res?.data?.[category];

  function row(entry: Entry, g: "M" | "F") {
    const inner = (
      <>
        <span className={`ss-rank${entry.rank <= 3 ? ` ss-rank--${entry.rank}` : ""}`}>{entry.rank}</span>
        <span className="ss-lb-body">
          <span className="ss-lb-name" style={{ display: "block" }}>{entry.display_name}</span>
          {(entry.club || entry.event_name) && (
            <span className="ss-lb-meta" style={{ display: "block" }}>
              {[entry.club, entry.event_name].filter(Boolean).join(" · ")}
            </span>
          )}
        </span>
        <span className="ss-lb-time">{formatTime(entry.best_time_ms)}</span>
      </>
    );
    if (onSelectAthlete) {
      return (
        <button
          type="button"
          className="ss-lb-row"
          onClick={() => onSelectAthlete({ id: entry.athlete_id, display_name: entry.display_name, birth_year: null, gender: g })}
        >
          {inner}
        </button>
      );
    }
    return (
      <Link className="ss-lb-row" href={`/utovere?athleteId=${entry.athlete_id}`}>
        {inner}
      </Link>
    );
  }

  return (
    <section className="ss-card" aria-label={`Topplister ${year}`}>
      <div className="ss-lb-head">
        <div>
          <h2 className="ss-h2">{title ?? `Topplister ${year}`}</h2>
        </div>
        <div className="ss-seg" role="tablist" aria-label="Distanse">
          {MAIN_DISTANCES.map((d) => (
            <button
              key={d.key}
              role="tab"
              aria-selected={category === d.key}
              className={`ss-seg-btn${category === d.key ? " active" : ""}`}
              onClick={() => setCategory(d.key)}
            >
              {d.short}
            </button>
          ))}
        </div>
      </div>

      <div className="ss-lb-gender">
        <div className="ss-seg ss-seg--full" role="tablist" aria-label="Kjønn">
          {(["M", "F"] as const).map((g) => (
            <button
              key={g}
              role="tab"
              aria-selected={gender === g}
              className={`ss-seg-btn${gender === g ? " active" : ""}`}
              onClick={() => setGender(g)}
            >
              {g === "M" ? "Herrer" : "Damer"}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="ss-lb-cols">
          {[0, 1].map((c) => (
            <div key={c} className={`ss-lb-col${c === 0 ? " is-active" : ""}`}>
              <ul className="ss-lb-list">
                {Array.from({ length: 5 }, (_, i) => (
                  <li key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 8px" }}>
                    <span className="ss-skel" style={{ width: 28, height: 28, borderRadius: 999 }} />
                    <span className="ss-skel" style={{ flex: 1, height: 14 }} />
                    <span className="ss-skel" style={{ width: 52, height: 14 }} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {!loading && failed && <div className="ss-empty">Kunne ikke laste topplistene akkurat nå.</div>}

      {!loading && catData && (
        <div className="ss-lb-cols">
          {(["M", "F"] as const).map((g) => (
            <div key={g} className={`ss-lb-col${gender === g ? " is-active" : ""}`}>
              <div className="ss-lb-col-title">{g === "M" ? "Herrer" : "Damer"}</div>
              {catData[g].length === 0 ? (
                <div className="ss-empty">Ingen resultater ennå</div>
              ) : (
                <ul className="ss-lb-list">
                  {catData[g].map((entry) => (
                    <li key={entry.athlete_id}>{row(entry, g)}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="ss-lb-foot">
        <Link href={`/utovere/topp100?category=${category}&year=${year}&gender=${gender}`} className="ss-link">
          Se hele topplisten <ChevronRight size={16} />
        </Link>
      </div>
    </section>
  );
}
