"use client";

import TimeChart, { type ChartSeries } from "@/components/ui/TimeChart";

export type TrendPoint = { date: string; name: string; avgM: number | null; avgF: number | null };

// Categorical slots 1–2 (validated pair): men blue, women orange.
const COLOR_M = "#f5f4f2";
const COLOR_F = "#f068b7";

/** 2024-04-27 → 2024.32, so several editions in a year stay apart on a year axis. */
const yearPos = (d: string) => {
  const y = Number(d.slice(0, 4));
  return y + (Date.parse(d) - Date.UTC(y, 0, 1)) / (366 * 86_400_000);
};

export default function YearTrend({ points }: { points: TrendPoint[] }) {
  // One edition a year → plot on the year itself so every year gets its tick.
  const oneAYear = new Set(points.map((p) => p.date.slice(0, 4))).size === points.length;
  const xOf = (d: string) => (oneAYear ? Number(d.slice(0, 4)) : yearPos(d));
  const mk = (id: "M" | "F", name: string, color: string): ChartSeries => ({
    id,
    name,
    color,
    points: points
      .filter((p) => (id === "M" ? p.avgM : p.avgF) != null)
      .map((p) => ({ x: xOf(p.date), y: (id === "M" ? p.avgM : p.avgF)!, label: p.name, sub: `Snitt ${name.toLowerCase()} · ${p.date.slice(0, 4)}` })),
  });
  const series = [mk("M", "Menn", COLOR_M), mk("F", "Kvinner", COLOR_F)].filter((s) => s.points.length > 0);
  return (
    <>
      <div className="ss-legend" style={{ marginBottom: 10 }}>
        {series.map((s) => (
          <span key={s.id}><span className="ss-dot" style={{ background: s.color }} /> {s.name}</span>
        ))}
      </div>
      <TimeChart series={series} xType="year" height={220} />
    </>
  );
}
