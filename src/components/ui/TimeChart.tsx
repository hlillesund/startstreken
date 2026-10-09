"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatTime } from "@/components/utovere/utils";

export type ChartPoint = { x: number; y: number; label?: string; sub?: string; highlight?: boolean };
export type ChartSeries = { id: string; name: string; color: string; points: ChartPoint[] };

type Props = {
  series: ChartSeries[];
  /** "date": x is a timestamp (ms). "year": x is a year number. */
  xType: "date" | "year";
  height?: number;
  area?: boolean;
};

const MONTHS = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];

function niceStep(range: number, count: number) {
  // steps in ms that make sense for race times
  const candidates = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600].map((s) => s * 1000);
  const raw = range / Math.max(1, count);
  return candidates.find((c) => c >= raw) ?? candidates[candidates.length - 1];
}

export default function TimeChart({ series, xType, height = 240, area = false }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<{ si: number; pi: number } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(260, Math.round(el.getBoundingClientRect().width)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = height;
  const PL = 54, PR = 14, PT = 14, PB = 28;

  const geo = useMemo(() => {
    const all = series.flatMap((s) => s.points);
    if (all.length === 0) return null;
    let xMin = Math.min(...all.map((p) => p.x));
    let xMax = Math.max(...all.map((p) => p.x));
    if (xMin === xMax) {
      const pad = xType === "year" ? 1 : 30 * 86400000;
      xMin -= pad;
      xMax += pad;
    }
    const yVals = all.map((p) => p.y);
    const rawMin = Math.min(...yVals);
    const rawMax = Math.max(...yVals);
    const step = niceStep(Math.max(rawMax - rawMin, 20000), 4);
    const yMin = Math.floor(rawMin / step) * step;
    let yMax = Math.ceil(rawMax / step) * step;
    if (yMax === yMin) yMax = yMin + step;

    const sx = (x: number) => PL + ((x - xMin) / (xMax - xMin)) * (width - PL - PR);
    // faster (lower) times at the top
    const sy = (y: number) => PT + ((y - yMin) / (yMax - yMin)) * (H - PT - PB);

    const yTicks: number[] = [];
    for (let v = yMin; v <= yMax + 1; v += step) yTicks.push(v);
    // thin out if too many
    while (yTicks.length > 6) for (let i = yTicks.length - 2; i > 0; i -= 2) yTicks.splice(i, 1);

    let xTicks: { x: number; label: string }[] = [];
    if (xType === "year") {
      const years: number[] = [];
      for (let y = Math.ceil(xMin); y <= Math.floor(xMax); y++) years.push(y);
      const every = Math.ceil(years.length / Math.max(2, Math.floor((width - PL) / 56)));
      xTicks = years.filter((_, i) => i % every === 0).map((y) => ({ x: y, label: String(y) }));
    } else {
      const n = width < 420 ? 3 : 5;
      for (let i = 0; i < n; i++) {
        const t = xMin + ((xMax - xMin) * i) / (n - 1);
        const d = new Date(t);
        xTicks.push({ x: t, label: `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}` });
      }
    }
    return { sx, sy, yTicks, xTicks };
  }, [series, xType, width, H]);

  if (!geo) return null;
  const { sx, sy, yTicks, xTicks } = geo;

  function onPointer(e: React.PointerEvent<SVGRectElement>) {
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    let bestD = Infinity;
    let bestSi = -1;
    let bestPi = -1;
    for (let si = 0; si < series.length; si++) {
      const pts = series[si].points;
      for (let pi = 0; pi < pts.length; pi++) {
        const dx = sx(pts[pi].x) - px;
        const dy = (sy(pts[pi].y) - py) * 0.35;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          bestSi = si;
          bestPi = pi;
        }
      }
    }
    if (bestSi >= 0) setHover({ si: bestSi, pi: bestPi });
  }

  const hp = hover ? series[hover.si]?.points[hover.pi] : null;
  const hs = hover ? series[hover.si] : null;
  const tipLeft = hp ? Math.min(Math.max(sx(hp.x), 80), width - 80) : 0;

  return (
    <div ref={wrapRef} className="ss-chart">
      <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label="Utvikling over tid">
        <defs>
          {series.map((s) => (
            <linearGradient key={s.id} id={`ss-grad-${s.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.16" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PL} x2={width - PR} y1={sy(v)} y2={sy(v)} style={{ stroke: "var(--ss-chart-grid)" }} strokeWidth={1} />
            <text x={PL - 8} y={sy(v) + 4} textAnchor="end" style={{ fill: "var(--ss-chart-label)" }} fontSize={11} fontWeight={500}>
              {formatTime(v)}
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text
            key={i}
            x={sx(t.x)}
            y={H - 8}
            textAnchor={i === 0 && xType === "date" ? "start" : i === xTicks.length - 1 && xType === "date" ? "end" : "middle"}
            style={{ fill: "var(--ss-chart-label)" }}
            fontSize={11}
            fontWeight={500}
          >
            {t.label}
          </text>
        ))}

        {series.map((s) => {
          const pts = s.points.slice().sort((a, b) => a.x - b.x);
          if (pts.length === 0) return null;
          const d = pts.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
          const areaD = `${d} L${sx(pts[pts.length - 1].x).toFixed(1)},${H - PB} L${sx(pts[0].x).toFixed(1)},${H - PB} Z`;
          return (
            <g key={s.id}>
              {area && pts.length > 1 && <path d={areaD} fill={`url(#ss-grad-${s.id})`} />}
              {pts.length > 1 && <path d={d} fill="none" stroke={s.color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />}
              {pts.map((p, i) => (
                <circle
                  key={i}
                  cx={sx(p.x)}
                  cy={sy(p.y)}
                  r={p.highlight ? 5 : 3.5}
                  fill={p.highlight ? s.color : "var(--ss-surface)"}
                  stroke={s.color}
                  strokeWidth={2}
                />
              ))}
            </g>
          );
        })}

        {hp && hs && (
          <g pointerEvents="none">
            <line x1={sx(hp.x)} x2={sx(hp.x)} y1={PT} y2={H - PB} style={{ stroke: "var(--ss-fg)" }} strokeOpacity={0.25} strokeDasharray="3 3" />
            <circle cx={sx(hp.x)} cy={sy(hp.y)} r={6.5} fill={hs.color} style={{ stroke: "var(--ss-surface)" }} strokeWidth={2.5} />
          </g>
        )}

        <rect
          x={0}
          y={0}
          width={width}
          height={H}
          fill="transparent"
          style={{ touchAction: "pan-y" }}
          onPointerMove={onPointer}
          onPointerDown={onPointer}
          onPointerLeave={() => setHover(null)}
        />
      </svg>

      {hp && hs && (
        <div className="ss-chart-tip" style={{ left: tipLeft, top: sy(hp.y) }}>
          {series.length > 1 && <span style={{ color: "#fff", fontWeight: 700 }}>{hs.name}</span>}
          <strong>{formatTime(hp.y)}</strong>
          {hp.label && <span style={{ display: "block" }}>{hp.label}</span>}
          {hp.sub && <span style={{ display: "block" }}>{hp.sub}</span>}
        </div>
      )}
    </div>
  );
}
