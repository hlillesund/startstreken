"use client";

import { useEffect, useState } from "react";
import { formatTime } from "./utils";
import type { AthleteHit } from "./types";

const CATEGORIES = ["5K", "10K", "HM", "M"] as const;

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
}

const rankStyle: Record<number, React.CSSProperties> = {
  1: {
    background: "var(--fg)",
    borderBottom: "1px solid var(--line)",
  },
  2: { background: "var(--bg-2)", borderBottom: "1px solid var(--line)" },
  3: { background: "var(--bg-2)", borderBottom: "1px solid var(--line)" },
};

const rankBadgeStyle: Record<number, React.CSSProperties> = {
  1: {
    background: "var(--highlight)",
    color: "var(--fg)",
    fontFamily: "var(--font-display)",
    fontSize: 15,
    letterSpacing: "0.04em",
    width: 24,
    height: 24,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  2: {
    color: "var(--fg-3)",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    width: 24,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  3: {
    color: "var(--fg-3)",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    width: 24,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
};

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
    <div className="cpn-leaderboards">

      {/* ── Header ── */}
      <div className="cpn-leaderboards-head">
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            letterSpacing: "0.06em",
            color: "var(--fg)",
          }}
        >
          Topplistene {year}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--fg-3)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              background: "var(--success)",
              borderRadius: "50%",
              display: "inline-block",
            }}
          />
          Live · Oppdatert nå
        </span>
      </div>

      {/* ── Tabs ── */}
      <div className="cpn-tabs" style={{ borderBottom: "1px solid var(--line-mid)" }}>
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

      {/* ── Loading ── */}
      {loading && (
        <p className="cpn-empty" style={{ padding: "20px 24px" }}>
          Laster toppliste…
        </p>
      )}

      {/* ── Gender columns ── */}
      {!loading && catData && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
          }}
          className="cpn-lb-gender-grid"
        >
          {(["M", "F"] as const).map((gender, gi) => (
            <div
              key={gender}
              style={{ borderRight: gi === 0 ? "1px solid var(--line-mid)" : "none" }}
            >
              {/* Gender label row */}
              <div
                style={{
                  padding: "10px 20px",
                  borderBottom: "1px solid var(--line)",
                  background: "var(--bg-3)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase" as const,
                  color: "var(--fg-2)",
                }}
              >
                {gender === "M" ? "Herrer" : "Damer"}
              </div>

              {/* Top 3 rows */}
              {catData[gender].slice(0, 3).map((entry) => {
                const isFirst = entry.rank === 1;
                return (
                  <div
                    key={entry.athlete_id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "28px 1fr",
                      alignItems: "center",
                      gap: "8px 12px",
                      padding: "12px 14px",
                      cursor: onSelectAthlete ? "pointer" : "default",
                      transition: "background 0.12s",
                      ...(rankStyle[entry.rank] ?? {
                        background: "var(--bg-2)",
                        borderBottom: "1px solid var(--line)",
                      }),
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.background = isFirst
                        ? "#1c1c1c"
                        : "var(--bg-3)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.background = isFirst
                        ? "var(--fg)"
                        : "var(--bg-2)";
                    }}
                    onClick={() =>
                      onSelectAthlete?.({
                        id: entry.athlete_id,
                        display_name: entry.display_name,
                        birth_year: null,
                        gender,
                      })
                    }
                  >
                    {/* Rank badge */}
                    <div style={rankBadgeStyle[entry.rank] ?? { color: "var(--fg-3)", fontSize: 11, width: 24 }}>
                      {entry.rank}
                    </div>

                    {/* Name + time + club */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                        <span
                          style={{
                            fontFamily: "var(--font-body)",
                            fontSize: 13,
                            fontWeight: 700,
                            color: isFirst ? "#ffffff" : "var(--fg)",
                            lineHeight: 1.2,
                          }}
                        >
                          {entry.display_name}
                        </span>
                        <span
                          style={{
                            fontFamily: "var(--font-display)",
                            fontSize: 16,
                            letterSpacing: "0.04em",
                            lineHeight: 1,
                            color: isFirst ? "var(--highlight)" : "var(--fg)",
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                        >
                          {formatTime(entry.best_time_ms)}
                        </span>
                      </div>
                      {entry.club && (
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 9,
                            color: isFirst ? "rgba(255,255,255,0.45)" : "var(--fg-3)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {entry.club}
                        </span>
                      )}
                      {entry.event_name && (
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 9,
                            fontStyle: "italic",
                            color: isFirst ? "rgba(255,255,255,0.35)" : "var(--fg-3)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {entry.event_name}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {catData[gender].length === 0 && (
                <div
                  style={{
                    padding: "16px 20px",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--fg-3)",
                  }}
                >
                  Ingen data
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Footer link ── */}
      <a
        href={`/utovere/topp100?category=${activeCategory}&year=${year}`}
        className="cpn-topp100-link"
      >
        Se topp 100 &rarr;
      </a>
    </div>
  );
}