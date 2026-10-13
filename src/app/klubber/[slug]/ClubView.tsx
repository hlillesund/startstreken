"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import CountUp from "@/components/ui/CountUp";
import type { ClubResult } from "@/lib/clubs";
import { MAIN_DISTANCES, distanceLabel, formatDateShort, formatPace, formatTime } from "@/components/utovere/utils";

type TopRow = { athlete_id: string; display_name: string; birth_year: number | null; t: number; event: string; date: string | null };
export type ClubTop = Record<string, { F: TopRow[]; M: TopRow[] }>;
type Member = { athlete_id: string; display_name: string; birth_year: number | null; races: number };

const nf = new Intl.NumberFormat("nb-NO");

function TopList({ title, rows, meters }: { title: string; rows: TopRow[]; meters: number }) {
  return (
    <div className="ss-card ss-ap-card">
      <div className="ss-ap-card-head">
        <h3 className="ss-ap-card-title">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <div className="ss-empty" style={{ padding: "18px 0 8px" }}>Ingen resultater</div>
      ) : (
        <ol className="ss-club-top">
          {rows.map((r, i) => (
            <li key={r.athlete_id}>
              <Link href={`/utovere?athleteId=${r.athlete_id}`}>
                <span className={`ss-rank${i === 0 ? " ss-rank--1" : ""}`}>{i + 1}</span>
                <span className="ss-club-top-who">
                  <span className="ss-lb-name">{r.display_name}</span>
                  <span className="ss-lb-meta">{[r.birth_year, r.event].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="ss-club-top-t">
                  <span className="ss-lb-time">{formatTime(r.t)}</span>
                  <span className="ss-lb-meta">{formatPace(r.t, meters)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function ClubView({
  year,
  runners,
  women,
  men,
  races,
  results,
  top,
  members,
  recent,
}: {
  year: number;
  runners: number;
  women: number;
  men: number;
  races: number;
  results: number;
  top: ClubTop;
  members: Member[];
  recent: ClubResult[];
}) {
  const first = MAIN_DISTANCES.find((d) => top[d.key] && (top[d.key].F.length || top[d.key].M.length))?.key ?? "10K";
  const [dist, setDist] = useState<string>(first);
  const [showAll, setShowAll] = useState(false);
  const d = MAIN_DISTANCES.find((x) => x.key === dist)!;
  const visible = showAll ? members : members.slice(0, 10);

  return (
    <>
      <section className="ss-ap-stats ss-reveal ss-stagger" aria-label="Nøkkeltall">
        <div className="ss-ap-stat">
          <div className="ss-ap-stat-label">Løpere</div>
          <div className="ss-ap-stat-val"><CountUp value={runners} /></div>
          <div className="ss-ap-stat-sub">{nf.format(women)} damer · {nf.format(men)} herrer</div>
        </div>
        <div className="ss-ap-stat">
          <div className="ss-ap-stat-label">Løp</div>
          <div className="ss-ap-stat-val"><CountUp value={races} /></div>
          <div className="ss-ap-stat-sub">{nf.format(results)} resultater i {year}</div>
        </div>
      </section>

      <section className="ss-ap-section">
        <h2 className="ss-h2 ss-reveal">Klubbens <em>raskeste</em></h2>
        <div className="ss-seg ss-reveal" role="tablist" aria-label="Distanse" style={{ marginBottom: 12 }}>
          {MAIN_DISTANCES.map((x) => (
            <button key={x.key} type="button" role="tab" aria-selected={dist === x.key} className={`ss-seg-btn${dist === x.key ? " active" : ""}`} onClick={() => setDist(x.key)}>
              {x.short}
            </button>
          ))}
        </div>
        <div className="ss-club-tops ss-reveal ss-stagger" key={dist}>
          <TopList title="Damer" rows={top[dist]?.F ?? []} meters={d.meters} />
          <TopList title="Herrer" rows={top[dist]?.M ?? []} meters={d.meters} />
        </div>
      </section>

      <section className="ss-ap-section">
        <h2 className="ss-h2 ss-reveal">Mest <em>aktive</em></h2>
        <div className="ss-card ss-reveal">
          <ol className="ss-rank-table">
            {visible.map((m, i) => (
              <li key={m.athlete_id}>
                <Link href={`/utovere?athleteId=${m.athlete_id}`} className="ss-rank-row">
                  <span className="ss-rank">{i + 1}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="ss-lb-name" style={{ display: "block" }}>{m.display_name}</span>
                    {m.birth_year && <span className="ss-lb-meta" style={{ display: "block" }}>f. {m.birth_year}</span>}
                  </span>
                  <span style={{ textAlign: "right" }}>
                    <span className="ss-lb-time" style={{ display: "block" }}>{m.races}</span>
                    <span className="ss-lb-meta" style={{ display: "block" }}>løp</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          {!showAll && members.length > 10 && (
            <div style={{ padding: "4px 16px 18px" }}>
              <button type="button" className="ss-btn" style={{ width: "100%" }} onClick={() => setShowAll(true)}>
                Vis alle {nf.format(members.length)} løpere
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="ss-ap-section">
        <h2 className="ss-h2 ss-reveal">Siste <em>resultater</em></h2>
        <div className="ss-card ss-reveal">
          <ul className="ss-rank-table">
            {recent.map((r) => (
              <li key={`${r.race_id}-${r.athlete_id}-${r.time_ms}`}>
                <Link href={`/lop/${r.event_id}?race=${r.race_id}&utover=${r.athlete_id}`} className="ss-rank-row ss-rank-row--norank">
                  <span style={{ minWidth: 0 }}>
                    <span className="ss-lb-name" style={{ display: "block" }}>{r.display_name}</span>
                    <span className="ss-lb-meta" style={{ display: "block" }}>
                      {[r.event_name, r.cat ? distanceLabel(r.cat) : r.race_name, formatDateShort(r.date)].join(" · ")}
                    </span>
                  </span>
                  <span style={{ textAlign: "right", display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span>
                      <span className="ss-lb-time" style={{ display: "block" }}>{formatTime(r.time_ms)}</span>
                      {r.rank_overall && <span className="ss-lb-meta" style={{ display: "block" }}>{r.rank_overall}. plass</span>}
                    </span>
                    <ChevronRight size={16} className="ss-muted" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
