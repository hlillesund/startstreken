"use client";

import Image from "next/image";
import React, { useEffect, useMemo, useRef, useState } from "react";

type AthleteHit = {
  id: string;
  display_name: string;
  birth_year?: number | null;
};

type DistanceCategory = "5K" | "10K" | "HM" | "M" | "OTHER";

type AthleteResultRow = {
  start_date: string | null; // forvent "YYYY-MM-DD" etter API-fix
  event_name: string;
  race_name: string;
  time_ms: number;
  club?: string | null;
  distance_category?: DistanceCategory | null;
};

const FILTERS = [
  { key: "5K", label: "5 km" },
  { key: "10K", label: "10 km" },
  { key: "HM", label: "Halvmaraton" },
  { key: "M", label: "Maraton" },
  { key: "OTHER", label: "Annet" },
] as const;

const ACCENT_GREEN = "#22c55e"; // <-- bytt til din brand-grønn hvis du har en eksakt hex

function formatTime(ms: number) {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// Start_date er "YYYY-MM-DD" -> parse uten timezone
function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr;
  const [, y, mo, d] = m;
  return `${d}.${mo}.${y}`;
}

function mostCommon(values: (string | null | undefined)[]) {
  const map = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    map.set(v, (map.get(v) ?? 0) + 1);
  }
  let best: string | null = null;
  let max = 0;
  for (const [k, n] of map) {
    if (n > max) {
      best = k;
      max = n;
    }
  }
  return best;
}

/* ---------- GLASS CHART (SVG) ---------- */

type ChartPoint = {
  x: number;
  y: number;
  row: AthleteResultRow;
};

function TrendChart({ rows }: { rows: AthleteResultRow[] }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const data = useMemo(() => {
    const clean = rows
      .filter((r) => r.start_date)
      .slice()
      .sort((a, b) => (a.start_date! < b.start_date! ? -1 : 1));
    return clean;
  }, [rows]);

  if (data.length < 2) {
    return (
      <div className="text-sm text-white/70">
        Ikke nok datapunkter til å vise graf.
      </div>
    );
  }

  const W = 860;
  const H = 300;
  const P = 56; // padding

  const times = data.map((d) => d.time_ms);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const range = max - min || 1;

  const xStep = (W - P * 2) / (data.length - 1);

  const points: ChartPoint[] = data.map((row, i) => {
    const x = P + i * xStep;
    // lavere tid = bedre -> høyere oppe
    const y = P + ((row.time_ms - min) / range) * (H - P * 2);
    return { x, y, row };
  });

  // line path
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  // axes ticks
  const yTicks = 5;
  const yTickVals = Array.from({ length: yTicks }, (_, i) => {
    const t = i / (yTicks - 1); // 0..1
    const val = min + t * range;
    const y = P + t * (H - P * 2);
    return { val, y };
  });

  const xTickCount = Math.min(4, data.length);
  const xTicks = Array.from({ length: xTickCount }, (_, i) => {
    const idx =
      xTickCount === 1 ? 0 : Math.round((i / (xTickCount - 1)) * (data.length - 1));
    return { idx, x: points[idx].x, label: formatDate(data[idx].start_date) };
  });

  const hover = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full select-none"
      >
        {/* grid + axes */}
        <rect x={0} y={0} width={W} height={H} fill="transparent" />

        {/* horizontal grid + y labels */}
        {yTickVals.map((t, i) => (
          <g key={i}>
            <line
              x1={P}
              x2={W - P}
              y1={t.y}
              y2={t.y}
              stroke="rgba(255,255,255,0.10)"
              strokeWidth={1}
            />
            <text
              x={10}
              y={t.y + 4}
              fill="rgba(255,255,255,0.75)"
              fontSize={11}
            >
              {formatTime(t.val)}
            </text>
          </g>
        ))}

        {/* x axis line */}
        <line
          x1={P}
          x2={W - P}
          y1={H - P}
          y2={H - P}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={1}
        />

        {/* x ticks */}
        {xTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={t.x}
              x2={t.x}
              y1={H - P}
              y2={H - P + 6}
              stroke="rgba(255,255,255,0.30)"
              strokeWidth={1}
            />
            <text
              x={t.x}
              y={H - P + 20}
              textAnchor="middle"
              fill="rgba(255,255,255,0.75)"
              fontSize={11}
            >
              {t.label}
            </text>
          </g>
        ))}

        {/* line */}
        <path d={path} fill="none" stroke={ACCENT_GREEN} strokeWidth={2.5} />

        {/* points */}
        {points.map((p, i) => {
          const isHover = hoverIndex === i;
          return (
            <g key={i}>
              {/* outer ring */}
              <circle
                cx={p.x}
                cy={p.y}
                r={isHover ? 7 : 5}
                fill="rgba(0,0,0,0.35)"
                stroke={ACCENT_GREEN}
                strokeWidth={2}
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
                style={{ cursor: "pointer" }}
              />
              {/* inner dot */}
              <circle
                cx={p.x}
                cy={p.y}
                r={isHover ? 3 : 2.5}
                fill={ACCENT_GREEN}
                pointerEvents="none"
              />
            </g>
          );
        })}

        {/* hover guide */}
        {hover && (
          <>
            <line
              x1={hover.x}
              x2={hover.x}
              y1={P}
              y2={H - P}
              stroke="rgba(34,197,94,0.25)"
              strokeWidth={1}
            />
          </>
        )}
      </svg>

      {/* tooltip */}
      {hover && (
        <div
          className="absolute"
          style={{
            left: `${(hover.x / W) * 100}%`,
            top: `${(hover.y / H) * 100}%`,
            transform: "translate(-50%, calc(-100% - 12px))",
          }}
        >
          <div className="rounded-xl border border-white/15 bg-black/60 px-4 py-2 text-sm text-white shadow-xl backdrop-blur-xl">
            <div className="font-medium leading-snug">{hover.row.event_name}</div>
            <div className="text-white/80">
              {formatDate(hover.row.start_date)} • {formatTime(hover.row.time_ms)}
            </div>
            <div className="text-white/60 text-xs mt-0.5">{hover.row.race_name}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- PAGE ---------- */

export default function UtoverePage() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<AthleteHit[]>([]);
  const [loadingHits, setLoadingHits] = useState(false);

  const [selected, setSelected] = useState<AthleteHit | null>(null);
  const [results, setResults] = useState<AthleteResultRow[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);

  const [filter, setFilter] = useState<DistanceCategory>("HM");

  const [sortBy, setSortBy] = useState<"date" | "time">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const canSearch = q.trim().length >= 2;

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;

    if (!canSearch || selected) {
      setHits([]);
      setLoadingHits(false);
      return;
    }

    setLoadingHits(true);
    t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/athletes/search?q=${encodeURIComponent(q.trim())}`);
        const data = await res.json();
        setHits(Array.isArray(data) ? data : []);
      } catch {
        setHits([]);
      } finally {
        setLoadingHits(false);
      }
    }, 200);

    return () => {
      if (t) clearTimeout(t);
    };
  }, [q, canSearch, selected]);

  async function loadResults(a: AthleteHit) {
    setSelected(a);
    setLoadingResults(true);
    setResults([]);

    // background refresh (don’t await)
    fetch(`/api/athletes/${a.id}/refresh-eqtiming`, { method: "POST" }).catch(() => {});

    try {
      const res = await fetch(`/api/athletes/${a.id}/results`);
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } finally {
      setLoadingResults(false);
    }
  }

  const club = useMemo(() => mostCommon(results.map((r) => r.club)), [results]);
  const age = selected?.birth_year ? new Date().getFullYear() - selected.birth_year : null;

  const filtered = useMemo(() => {
    return results.filter((r) => (r.distance_category ?? "OTHER") === filter);
  }, [results, filter]);

  const sorted = useMemo(() => {
    const arr = filtered.slice();
    arr.sort((a, b) => {
      if (sortBy === "time") {
        const v = a.time_ms - b.time_ms;
        return sortDir === "asc" ? v : -v;
      }

      // date sort (string "YYYY-MM-DD" sort works lexicographically)
      const da = a.start_date ?? "";
      const db = b.start_date ?? "";
      const v = da.localeCompare(db);
      return sortDir === "asc" ? v : -v;
    });
    return arr;
  }, [filtered, sortBy, sortDir]);

  const showChart = selected && filter !== "OTHER" && sorted.length > 1;

  return (
    <section className="relative min-h-screen w-full">
      <Image src="/running1.jpg" alt="Running background" fill priority className="object-cover" />
      <div className="absolute inset-0 bg-black/55" />

      <div className="relative z-10 mx-auto max-w-5xl px-6" style={{ paddingTop: "var(--topnav-h)" }}>
        <div className="pt-24 pb-12 text-center text-white">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Utøvere</h1>
          <p className="mt-4 text-lg text-white/85">Søk etter en utøver og se resultater på tvers av løp.</p>

          {!selected && (
            <div className="mx-auto mt-8 max-w-md">
              <input
                className="w-full rounded-full border border-white/20 bg-white/10 px-5 py-3 text-white placeholder:text-white/60 outline-none backdrop-blur-md transition focus:border-white/40"
                placeholder="Søk utøver (min. 2 tegn)…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <div className="mt-3 text-sm text-white/70">
                {loadingHits ? "Søker…" : canSearch ? `${hits.length} treff` : "Skriv minst 2 tegn"}
              </div>
            </div>
          )}
        </div>

        {/* MAIN WHITE CARD */}
        <div className="mx-auto mb-8 mt-4 max-w-4xl rounded-2xl bg-white p-6 sm:p-12 text-black shadow-2xl">
          {/* Treffliste */}
          {!selected && hits.length > 0 && (
            <div className="rounded-2xl border p-2">
              {hits.map((h) => (
                <button
                  key={h.id}
                  onClick={() => loadResults(h)}
                  className="w-full rounded-xl px-4 py-3 text-left transition hover:bg-black/5"
                >
                  <div className="font-medium">{h.display_name}</div>
                  <div className="text-xs text-zinc-500">Klikk for å se resultater</div>
                </button>
              ))}
            </div>
          )}

          {!selected && !loadingHits && canSearch && hits.length === 0 && (
            <div className="rounded-2xl border border-black/10 p-6 text-sm text-zinc-600">
              Ingen treff. (Tips: prøv færre ord eller bare etternavn.)
            </div>
          )}

          {selected && (
            <>
              <button
                className="mb-4 text-sm underline text-zinc-700 hover:text-black"
                onClick={() => {
                  setSelected(null);
                  setResults([]);
                  setFilter("HM");
                  setSortBy("date");
                  setSortDir("desc");
                }}
              >
                ← Tilbake til søk
              </button>

              <div className="mb-6">
                <div className="text-sm font-medium text-zinc-600">Utøver</div>
                <div className="text-2xl font-semibold">{selected.display_name}</div>
                <div className="mt-1 text-sm text-zinc-600">
                  {selected.birth_year ? `Født ${selected.birth_year}${age ? ` • ${age} år` : ""}` : ""}
                  {club ? ` • ${club}` : ""}
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-2">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`rounded-full px-4 py-2 text-sm font-medium border transition ${
                      filter === f.key ? "bg-black text-white border-black" : "bg-white text-black border-black/15 hover:bg-black/5"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Sort */}
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-zinc-600 mr-2">Sorter:</span>
                <button
                  onClick={() => setSortBy("date")}
                  className={`rounded-full px-3 py-1.5 border ${
                    sortBy === "date" ? "bg-black text-white border-black" : "border-black/15 hover:bg-black/5"
                  }`}
                >
                  Dato
                </button>
                <button
                  onClick={() => setSortBy("time")}
                  className={`rounded-full px-3 py-1.5 border ${
                    sortBy === "time" ? "bg-black text-white border-black" : "border-black/15 hover:bg-black/5"
                  }`}
                >
                  Tid
                </button>
                <button
                  onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                  className="rounded-full px-3 py-1.5 border border-black/15 hover:bg-black/5"
                  title="Bytt rekkefølge"
                >
                  {sortDir === "asc" ? "↑" : "↓"}
                </button>
              </div>

              {loadingResults && <div className="mt-4 text-sm text-zinc-600">Laster resultater…</div>}

              {!loadingResults && sorted.length === 0 && (
                <div className="mt-6 rounded-2xl border border-black/10 p-6 text-sm text-zinc-600">
                  Ingen resultater i denne kategorien.
                </div>
              )}

              {!loadingResults && sorted.length > 0 && (
                <div className="mt-6 overflow-hidden rounded-2xl border">
                  <div className="grid grid-cols-12 gap-0 border-b bg-black/5 px-4 py-2 text-xs font-semibold">
                    <div className="col-span-3">Dato</div>
                    <div className="col-span-7">Løp</div>
                    <div className="col-span-2 text-right">Tid</div>
                  </div>

                  {sorted.map((r, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-0 border-b px-4 py-3 text-sm last:border-b-0">
                      <div className="col-span-3 opacity-80">{formatDate(r.start_date)}</div>
                      <div className="col-span-7">
                        <div>{r.event_name}</div>
                        <div className="text-xs text-zinc-500">{r.race_name}</div>
                      </div>
                      <div className="col-span-2 text-right font-medium">{formatTime(r.time_ms)}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* CHART CARD (dark glass) */}
        {showChart && (
          <div className="mx-auto mb-32 max-w-4xl rounded-2xl border border-white/15 bg-black/35 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <div className="text-white">
                <div className="text-sm text-white/70">Utvikling</div>
                <div className="text-lg font-semibold">
                  {FILTERS.find((f) => f.key === filter)?.label}
                </div>
              </div>
              <div className="text-xs text-white/60">
                Hover på punkt for detaljer
              </div>
            </div>

            <TrendChart rows={sorted} />
          </div>
        )}
      </div>
    </section>
  );
}