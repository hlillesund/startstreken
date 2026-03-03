"use client";

import { useEffect, useState } from "react";
import { formatTime } from "./utils";
import type { AthleteHit } from "./types";

const CATEGORIES = ["5K", "10K", "HM", "M"] as const;
const LABELS: Record<string, string> = { "5K": "5K", "10K": "10K", HM: "Halvmaraton", M: "Maraton" };

type Entry = { athlete_id: string; display_name: string; best_time_ms: number; rank: number };
type CategoryData = { M: Entry[]; F: Entry[] };
type LeaderboardData = Record<string, CategoryData>;

interface Props {
  year: number;
  onSelectAthlete?: (athlete: AthleteHit) => void;
}

export default function TopLeaderboards({ year, onSelectAthlete }: Props) {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>("HM");

  useEffect(() => {
    fetch(`/api/leaderboards?year=${year}`)
      .then((r) => r.json())
      .then((d) => d.ok && setData(d.results))
      .finally(() => setLoading(false));
  }, [year]);

  const catData = data?.[activeCategory];

  return (
    <div className="cpn-leaderboard">
      <div className="cpn-section-label">Topplistene {year}</div>

      <div className="cpn-tabs" style={{ marginBottom: 16 }}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`cpn-tab${activeCategory === cat ? " active" : ""}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat === "HM" ? "HM" : cat === "M" ? "MAR" : cat}
          </button>
        ))}
      </div>

      {loading && <p className="cpn-empty">Laster toppliste…</p>}

      {!loading && catData && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {(["M", "F"] as const).map((gender) => (
              <div key={gender} className="cpn-leaderboard-gender">
                <div className="cpn-leaderboard-gender-label">
                  {gender === "M" ? "Herrer" : "Damer"}
                </div>
                <div className="cpn-table">
                  <div className="cpn-table-head">
                    <div className="cpn-th" style={{ width: 32 }}>#</div>
                    <div className="cpn-th">Navn</div>
                    <div className="cpn-th" style={{ textAlign: "right" }}>Tid</div>
                  </div>
                  {catData[gender].length === 0 && (
                    <div style={{ padding: "12px 16px", fontSize: 12, color: "#aaa" }}>Ingen data</div>
                  )}
                  {catData[gender].map((entry) => (
                    <div
                      key={entry.athlete_id}
                      className="cpn-tr"
                      style={{ cursor: onSelectAthlete ? "pointer" : "default" }}
                      onClick={() =>
                        onSelectAthlete?.({
                          id: entry.athlete_id,
                          display_name: entry.display_name,
                          birth_year: null,
                          gender,
                        })
                      }
                    >
                      <div className="cpn-td" style={{ width: 32, color: "#888" }}>{entry.rank}</div>
                      <div className="cpn-td">{entry.display_name}</div>
                      <div className="cpn-td">
                        <span className="cpn-time">{formatTime(entry.best_time_ms)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <a
            href={`/utovere/topp100?category=${activeCategory}&year=${year}`}
            className="cpn-topp100-link"
            style={{ display: "block", marginTop: 16, textAlign: "center", fontSize: 13, color: "#888" }}
          >
            Se topp 100 &rarr;
          </a>
        </>
      )}
    </div>
  );
}