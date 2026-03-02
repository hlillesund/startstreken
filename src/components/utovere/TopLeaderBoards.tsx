"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { DistanceCategory, LeaderboardRow } from "./types";
import { formatDate, formatTime } from "./utils";

const CATS: { key: Exclude<DistanceCategory, "OTHER">; label: string; long: string }[] = [
  { key: "5K", label: "5K", long: "5 Kilometer" },
  { key: "10K", label: "10K", long: "10 Kilometer" },
  { key: "HM", label: "HM", long: "Halvmaraton" },
  { key: "M", label: "MAR", long: "Maraton" },
];

function catHref(cat: Exclude<DistanceCategory, "OTHER">) {
  return `/utovere/ranking/${encodeURIComponent(cat)}`;
}

export default function TopLeaderboards({ year = new Date().getFullYear() }: { year?: number }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Record<string, LeaderboardRow[]>>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);

    Promise.all(
      CATS.map(async (c) => {
        const res = await fetch(`/api/leaderboards?category=${encodeURIComponent(c.key)}&year=${year}&limit=3`, {
          cache: "no-store",
        });
        const json = await res.json();
        return [c.key, (json?.rows ?? []) as LeaderboardRow[]] as const;
      })
    )
      .then((pairs) => {
        if (cancelled) return;
        const obj: Record<string, LeaderboardRow[]> = {};
        for (const [k, rows] of pairs) obj[k] = rows;
        setData(obj);
      })
      .catch(() => {
        if (!cancelled) setErr("Klarte ikke å laste ranking.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [year]);

  const headerRight = useMemo(() => `${year}`, [year]);

  return (
    <section className="cpn-leaderboards">
      <div className="cpn-leaderboards-head">
        <div className="cpn-section-label" style={{ marginBottom: 0 }}>
          Ranking — topp 3 per distanse
        </div>
        <div className="cpn-leaderboards-year">{headerRight}</div>
      </div>

      {err && <div className="cpn-leaderboards-error">{err}</div>}

      <div className="cpn-leaderboards-grid">
        {CATS.map((c) => {
          const rows = data[c.key] ?? [];
          return (
            <a key={c.key} className="cpn-lb-card" href={catHref(c.key)} aria-label={`Se topp 100 for ${c.long}`}>
              <div className="cpn-lb-card-top">
                <div>
                  <div className="cpn-lb-title">{c.long}</div>
                  <div className="cpn-lb-sub">Klikk for topp 100</div>
                </div>
                <div className="cpn-lb-pill">{c.label}</div>
              </div>

              <div className="cpn-lb-list">
                {loading && (
                  <>
                    <div className="cpn-lb-skel" />
                    <div className="cpn-lb-skel" />
                    <div className="cpn-lb-skel" />
                  </>
                )}

                {!loading && rows.length === 0 && <div className="cpn-lb-empty">Ingen data</div>}

                {!loading &&
                  rows.slice(0, 3).map((r) => (
                    <div key={r.athlete_id} className="cpn-lb-row">
                      <div className="cpn-lb-rank">#{r.rank}</div>
                      <div className="cpn-lb-name">{r.display_name}</div>
                      <div className="cpn-lb-time">{formatTime(r.best_time_ms)}</div>
                      <div className="cpn-lb-meta">{r.best_date ? formatDate(r.best_date) : "—"}</div>
                    </div>
                  ))}
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}