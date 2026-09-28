"use client";

import React, { useMemo, useState } from "react";
import type { AthleteResultRow } from "./types";
import { formatDate, formatTime } from "./utils";

export default function TrendChart({ rows }: { rows: AthleteResultRow[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const data = useMemo(
    () => rows.filter((r) => r.start_date).slice().sort((a, b) => (a.start_date! < b.start_date! ? -1 : 1)),
    [rows]
  );

  if (data.length < 2) return <p className="cpn-empty">Ikke nok datapunkter til å vise graf.</p>;

  const W = 900,
    H = 260,
    PX = 64,
    PY = 36;
  const times = data.map((d) => d.time_ms);
  const minT = Math.min(...times),
    maxT = Math.max(...times),
    range = maxT - minT || 1;
  const xStep = (W - PX * 2) / (data.length - 1);

  const pts = data.map((row, i) => ({
    x: PX + i * xStep,
    y: PY + ((row.time_ms - minT) / range) * (H - PY * 2),
    row,
  }));

  const path = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${path} L${pts[pts.length - 1].x},${H - PY} L${pts[0].x},${H - PY} Z`;

  const yTicks = 4;
  const hover = hoverIdx !== null ? pts[hoverIdx] : null;

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a1a1a" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#1a1a1a" stopOpacity="0" />
          </linearGradient>
        </defs>

        {Array.from({ length: yTicks }, (_, i) => {
          const t = i / (yTicks - 1);
          const y = PY + t * (H - PY * 2);
          const val = minT + t * range;
          return (
            <g key={i}>
              <line x1={PX} x2={W - PX} y1={y} y2={y} stroke="#e0dcd8" strokeWidth={0.5} />
              <text x={6} y={y + 4} fill="#999" fontSize={10} fontFamily="'DM Mono', monospace">
                {formatTime(val)}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill="url(#areaGrad)" />
        <path d={path} fill="none" stroke="#1a1a1a" strokeWidth={1.5} />

        {pts.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={14}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              style={{ cursor: "pointer" }}
            />
            <circle
              cx={p.x}
              cy={p.y}
              r={hoverIdx === i ? 5 : 3}
              fill={hoverIdx === i ? "#1a1a1a" : "#fff"}
              stroke="#1a1a1a"
              strokeWidth={1.5}
            />
          </g>
        ))}

        {hover && (
          <line
            x1={hover.x}
            x2={hover.x}
            y1={PY}
            y2={H - PY}
            stroke="#1a1a1a"
            strokeWidth={0.75}
            strokeDasharray="4 3"
          />
        )}

        {/* x-axis ticks */}
        {[0, Math.floor(data.length / 2), data.length - 1]
          .filter((v, i, a) => a.indexOf(v) === i)
          .map((idx) => (
            <text
              key={idx}
              x={pts[idx].x}
              y={H - 6}
              textAnchor="middle"
              fill="#999"
              fontSize={10}
              fontFamily="'DM Mono', monospace"
            >
              {formatDate(data[idx].start_date)}
            </text>
          ))}
      </svg>

      {hover && (
        <div
          style={{
            position: "absolute",
            left: `${(hover.x / W) * 100}%`,
            top: `${(hover.y / H) * 100}%`,
            transform: "translate(-50%, calc(-100% - 14px))",
            pointerEvents: "none",
          }}
        >
          <div className="cpn-tooltip">
            <span className="cpn-tooltip-time">{formatTime(hover.row.time_ms)}</span>
            <span className="cpn-tooltip-meta">{hover.row.event_name}</span>
            <span className="cpn-tooltip-date">{formatDate(hover.row.start_date)}</span>
          </div>
        </div>
      )}
    </div>
  );
}