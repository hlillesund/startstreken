"use client";

import { useMemo } from "react";
import TimeChart from "@/components/ui/TimeChart";
import type { AthleteResultRow } from "./types";
import { formatDateShort } from "./utils";

export default function TrendChart({ rows, color = "#0e1116" }: { rows: AthleteResultRow[]; color?: string }) {
  const series = useMemo(() => {
    const data = rows.filter((r) => r.start_date);
    const best = data.reduce<AthleteResultRow | null>((b, r) => (!b || r.time_ms < b.time_ms ? r : b), null);
    return [
      {
        id: "trend",
        name: "Resultater",
        color,
        points: data.map((r) => ({
          x: Date.parse(r.start_date!),
          y: r.time_ms,
          label: r.event_name,
          sub: `${formatDateShort(r.start_date)}${r === best ? " · PB" : ""}`,
          highlight: r === best,
        })),
      },
    ];
  }, [rows, color]);

  if (series[0].points.length < 2) return <p className="ss-empty">Ikke nok resultater til å vise utvikling.</p>;
  return <TimeChart series={series} xType="date" area />;
}
