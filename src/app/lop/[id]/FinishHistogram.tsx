"use client";

import { useState } from "react";
import { formatTime } from "@/components/utovere/utils";

export type Bins = { lo: number; step: number; counts: number[]; openStart: boolean; openEnd: boolean };

const H = 150;

/** Bars of finishers per time interval, with median marker and hover tooltip. */
export default function FinishHistogram({ bins, total, median, highlight }: { bins: Bins; total: number; median: number | null; highlight: number | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const { lo, step, counts } = bins;
  const n = counts.length;
  const max = Math.max(...counts, 1);
  const hi = lo + n * step;
  const pos = (ms: number) => ((Math.min(Math.max(ms, lo), hi) - lo) / (hi - lo)) * 100;
  const binOf = (ms: number) => Math.min(n - 1, Math.max(0, Math.floor((ms - lo) / step)));
  const hlBin = highlight != null ? binOf(highlight) : null;

  const label = (i: number) => {
    const from = lo + i * step, to = from + step;
    if (i === 0 && bins.openStart) return `under ${formatTime(to)}`;
    if (i === n - 1 && bins.openEnd) return `over ${formatTime(from)}`;
    return `${formatTime(from)}–${formatTime(to)}`;
  };
  // ~5 axis ticks on whole bins
  const every = Math.max(1, Math.ceil(n / 5));
  const ticks = Array.from({ length: n + 1 }, (_, i) => i).filter((i) => i % every === 0);

  return (
    <div className="ss-hist" onPointerLeave={() => setHover(null)}>
      <div className="ss-hist-plot" style={{ height: H }}>
        {counts.map((c, i) => (
          <div
            key={i}
            className="ss-hist-slot"
            onPointerEnter={() => setHover(i)}
            onPointerDown={() => setHover(i)}
            aria-label={`${label(i)}: ${c} løpere`}
          >
            <div
              className={`ss-hist-bar${i === hlBin ? " is-me" : ""}${hover === i ? " is-hover" : ""}`}
              style={{ height: c ? `${Math.max(2, (c / max) * 100)}%` : 0 }}
            />
          </div>
        ))}
        {median != null && (
          <div className="ss-hist-median" style={{ left: `${pos(median)}%` }}>
            <span>median {formatTime(median)}</span>
          </div>
        )}
        {hover != null && (
          <div className="ss-chart-tip" style={{ left: `${((hover + 0.5) / n) * 100}%`, top: `${H - (counts[hover] / max) * H}px` }}>
            <strong>{counts[hover].toLocaleString("nb-NO")} løpere</strong>
            <span>{label(hover)} · {total ? Math.round((counts[hover] / total) * 100) : 0} %</span>
          </div>
        )}
      </div>
      <div className="ss-hist-axis">
        {ticks.map((i) => (
          <span key={i} style={{ left: `${(i / n) * 100}%` }}>{formatTime(lo + i * step)}</span>
        ))}
      </div>
    </div>
  );
}
