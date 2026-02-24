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

const ACCENT_GREEN = "#22c55e";

function formatTime(ms: number) {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

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

function median(values: number[]) {
  if (values.length === 0) return null;
  const arr = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 === 0 ? Math.round((arr[mid - 1] + arr[mid]) / 2) : arr[mid];
}

function mean(values: number[]) {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round(sum / values.length);
}

function pctChange(newer: number, older: number) {
  if (!Number.isFinite(newer) || !Number.isFinite(older) || older === 0) return null;
  return ((newer - older) / older) * 100;
}

function yearFromDate(dateStr: string | null) {
  if (!dateStr) return null;
  const m = dateStr.match(/^(\d{4})-/);
  return m ? Number(m[1]) : null;
}

/* ---------- SEARCH HELPERS ---------- */

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreHit(query: string, name: string) {
  const q = norm(query);
  const n = norm(name);
  if (!q) return 0;

  if (n === q) return 1000;
  if (n.startsWith(q)) return 850;

  const qTokens = q.split(" ").filter(Boolean);
  const nTokens = n.split(" ").filter(Boolean);
  const nSet = new Set(nTokens);

  const allTokensPresent = qTokens.every((t) => nSet.has(t));
  if (allTokensPresent) return 700 + qTokens.length * 10;

  const overlap = qTokens.filter((t) => nSet.has(t)).length;
  if (overlap > 0) return 300 + overlap * 20;

  if (n.includes(q)) return 250;

  return 0;
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
    return <div className="text-sm text-white/70">Ikke nok datapunkter til å vise graf.</div>;
  }

  const W = 860;
  const H = 300;
  const P = 56;

  const times = data.map((d) => d.time_ms);
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const range = maxT - minT || 1;

  const xStep = (W - P * 2) / (data.length - 1);

  const points: ChartPoint[] = data.map((row, i) => {
    const x = P + i * xStep;
    const y = P + ((row.time_ms - minT) / range) * (H - P * 2);
    return { x, y, row };
  });

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const yTicks = 5;
  const yTickVals = Array.from({ length: yTicks }, (_, i) => {
    const t = i / (yTicks - 1);
    const val = minT + t * range;
    const y = P + t * (H - P * 2);
    return { val, y };
  });

  const xTickCount = Math.min(4, data.length);
  const xTicks = Array.from({ length: xTickCount }, (_, i) => {
    const idx = xTickCount === 1 ? 0 : Math.round((i / (xTickCount - 1)) * (data.length - 1));
    return { idx, x: points[idx].x, label: formatDate(data[idx].start_date) };
  });

  const hover = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div className="relative">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full select-none">
        <rect x={0} y={0} width={W} height={H} fill="transparent" />

        {yTickVals.map((t, i) => (
          <g key={i}>
            <line x1={P} x2={W - P} y1={t.y} y2={t.y} stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
            <text x={10} y={t.y + 4} fill="rgba(255,255,255,0.75)" fontSize={11}>
              {formatTime(t.val)}
            </text>
          </g>
        ))}

        <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />

        {xTicks.map((t, i) => (
          <g key={i}>
            <line x1={t.x} x2={t.x} y1={H - P} y2={H - P + 6} stroke="rgba(255,255,255,0.30)" strokeWidth={1} />
            <text x={t.x} y={H - P + 20} textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize={11}>
              {t.label}
            </text>
          </g>
        ))}

        <path d={path} fill="none" stroke={ACCENT_GREEN} strokeWidth={2.5} />

        {points.map((p, i) => {
          const isHover = hoverIndex === i;
          return (
            <g key={i}>
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
              <circle cx={p.x} cy={p.y} r={isHover ? 3 : 2.5} fill={ACCENT_GREEN} pointerEvents="none" />
            </g>
          );
        })}

        {hover && <line x1={hover.x} x2={hover.x} y1={P} y2={H - P} stroke="rgba(34,197,94,0.25)" strokeWidth={1} />}
      </svg>

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
            <div className="mt-0.5 text-xs text-white/60">{hover.row.race_name}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- GLASS PANELS ---------- */

function GlassPanel({
  title,
  subtitle,
  children,
  className = "",
  right,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border border-white/15 bg-black/35 p-6 shadow-2xl backdrop-blur-xl ${className}`}>
      {(title || subtitle || right) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="text-white">
            {title && <div className="text-lg font-semibold">{title}</div>}
            {subtitle && <div className="mt-0.5 text-sm text-white/65">{subtitle}</div>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

function StatPill({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-black/30 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-white/55">{label}</div>
      <div className="mt-1 text-xl font-semibold text-white">{value}</div>
      {hint && <div className="mt-1 text-xs text-white/55">{hint}</div>}
    </div>
  );
}

function PRTable({
  prs,
  onPick,
  active,
}: {
  prs: {
    cat: DistanceCategory;
    label: string;
    best: AthleteResultRow | null;
    count: number;
    avg: number | null;
  }[];
  onPick: (c: DistanceCategory) => void;
  active: DistanceCategory;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/12 bg-black/30">
      <div className="grid grid-cols-12 gap-0 border-b border-white/10 bg-black/30 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-white/70">
        <div className="col-span-3">Distanse</div>
        <div className="col-span-3">PB</div>
        <div className="col-span-3">Snitt</div>
        <div className="col-span-3 text-right">Antall</div>
      </div>

      <div className="divide-y divide-white/10">
        {prs.map((r) => {
          const activeRow = active === r.cat;
          return (
            <button
              key={r.cat}
              onClick={() => onPick(r.cat)}
              className={`grid w-full grid-cols-12 gap-0 px-4 py-3 text-left transition ${
                activeRow ? "bg-white/10" : "bg-transparent hover:bg-white/5"
              }`}
            >
              <div className="col-span-3 text-sm font-semibold text-white">{r.label}</div>
              <div className="col-span-3 text-sm text-white/80">{r.best ? formatTime(r.best.time_ms) : "-"}</div>
              <div className="col-span-3 text-sm text-white/70">{r.avg ? formatTime(r.avg) : "-"}</div>
              <div className="col-span-3 text-right text-sm text-white/70">{r.count}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- PAGE ---------- */

export default function UtoverePage() {
  const [refreshing, setRefreshing] = useState(false);

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
        const arr = Array.isArray(data) ? (data as AthleteHit[]) : [];

        const scored = arr
          .map((h) => ({ h, s: scoreHit(q, h.display_name) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s);

        const top = scored[0]?.s ?? 0;
        const threshold = Math.max(320, top - 280);
        const trimmed = scored
          .filter((x, idx) => idx === 0 || x.s >= threshold)
          .slice(0, 8)
          .map((x) => x.h);

        setHits(trimmed);
      } catch {
        setHits([]);
      } finally {
        setLoadingHits(false);
      }
    }, 220);

    return () => {
      if (t) clearTimeout(t);
    };
  }, [q, canSearch, selected]);

  async function loadResults(a: AthleteHit) {
    setSelected(a);
    setLoadingResults(true);
    setResults([]);

    const loadNow = async () => {
      const res = await fetch(`/api/athletes/${a.id}/results`, { cache: "no-store" });
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    };

    try {
      await loadNow();
    } finally {
      setLoadingResults(false);
    }

    // Refresh in background; do NOT block initial profile render
    setRefreshing(true);
    fetch(`/api/athletes/${a.id}/refresh-eqtiming`, { method: "POST" })
      .then(() => loadNow())
      .finally(() => setRefreshing(false));
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
      const da = a.start_date ?? "";
      const db = b.start_date ?? "";
      const v = da.localeCompare(db);
      return sortDir === "asc" ? v : -v;
    });
    return arr;
  }, [filtered, sortBy, sortDir]);

  const showChart = selected && filter !== "OTHER" && sorted.length > 1;

  // ---------- Analytics ----------
  const byCategory = useMemo(() => {
    const map = new Map<DistanceCategory, AthleteResultRow[]>();
    for (const r of results) {
      const c = (r.distance_category ?? "OTHER") as DistanceCategory;
      const arr = map.get(c) ?? [];
      arr.push(r);
      map.set(c, arr);
    }
    return map;
  }, [results]);

  const prs = useMemo(() => {
    const cats: { cat: DistanceCategory; label: string }[] = [
      { cat: "5K", label: "5K" },
      { cat: "10K", label: "10K" },
      { cat: "HM", label: "HM" },
      { cat: "M", label: "M" },
      { cat: "OTHER", label: "OTHER" },
    ];

    return cats.map(({ cat, label }) => {
      const arr = (byCategory.get(cat) ?? []).slice();
      arr.sort((a, b) => a.time_ms - b.time_ms);
      const best = arr.length ? arr[0] : null;
      const avg = mean(arr.map((x) => x.time_ms));
      return { cat, label, best, count: arr.length, avg };
    });
  }, [byCategory]);

  const activePR = useMemo(() => prs.find((p) => p.cat === filter) ?? prs[0], [prs, filter]);

  const trendStats = useMemo(() => {
    const arr = sorted
      .filter((r) => r.start_date)
      .slice()
      .sort((a, b) => (a.start_date! < b.start_date! ? -1 : 1));

    const times = arr.map((x) => x.time_ms);
    const avgT = mean(times);
    const medT = median(times);

    const first = arr[0] ?? null;
    const last = arr[arr.length - 1] ?? null;

    const change = first && last ? pctChange(last.time_ms, first.time_ms) : null;

    const best = arr.slice().sort((a, b) => a.time_ms - b.time_ms)[0] ?? null;

    // 2026 PB (placeholder KPI uses local data)
    const y2026 = arr.filter((r) => yearFromDate(r.start_date) === 2026);
    const pb2026 = y2026.length ? y2026.slice().sort((a, b) => a.time_ms - b.time_ms)[0] : null;

    return { avgT, medT, first, last, change, best, pb2026, count: arr.length };
  }, [sorted]);

  // Placeholder: “rank in 2026” – not implemented yet
  const [rank2026, setRank2026] = useState<{ rank: number; total: number } | null>(null);
  useEffect(() => {
    // Placeholder only. When you add an endpoint later, you can fetch it here.
    setRank2026(null);
  }, [selected?.id, filter]);

  return (
    <section className="relative min-h-screen w-full">
      <Image src="/running1.jpg" alt="Running background" fill priority className="object-cover" />
      <div className="absolute inset-0 bg-black/55" />

      <div className="relative z-10 mx-auto max-w-6xl px-6" style={{ paddingTop: "var(--topnav-h)" }}>
        <div className="pt-24 pb-12 text-center text-white">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Utøvere</h1>
          <p className="mt-4 text-lg text-white/85">Søk etter en utøver og se resultater på tvers av løp.</p>

          {/* SEARCH */}
          {!selected && (
            <div className="mx-auto mt-8 max-w-md">
              <div className="rounded-2xl border border-white/15 bg-black/35 p-2 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center gap-3 px-3 py-2">
                  <input
                    className="w-full bg-transparent py-2 text-white placeholder:text-white/50 outline-none"
                    placeholder="Søk utøver…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                  {q.trim().length > 0 && (
                    <button
                      type="button"
                      onClick={() => setQ("")}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10"
                      title="Tøm"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {q.trim().length > 0 && (
                  <div className="px-4 pb-2 text-left text-xs text-white/55">
                    {loadingHits ? "Søker…" : hits.length > 0 ? `${hits.length} forslag` : "Ingen treff"}
                  </div>
                )}

                {q.trim().length > 0 && !loadingHits && hits.length > 0 && (
                  <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                    <div className="divide-y divide-white/10">
                      {hits.map((h, idx) => (
                        <button
                          key={h.id}
                          onClick={() => loadResults(h)}
                          className="group flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/5"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white">{h.display_name}</div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-white/55">
                              {h.birth_year ? <span>Født {h.birth_year}</span> : <span>Utøver</span>}
                              {idx === 0 && (
                                <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white/70">
                                  Best match
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 text-white/35 transition group-hover:text-white/60">→</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {q.trim().length > 0 && !loadingHits && hits.length === 0 && (
                  <div className="mt-2 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-left text-sm text-white/65">
                    Ingen treff. Prøv færre ord eller bare etternavn.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ATHLETE VIEW */}
        {selected && (
          <>
            {/* Header card */}
            <div className="mx-auto mb-5 mt-2 max-w-6xl rounded-2xl border border-white/15 bg-black/35 p-5 text-white shadow-2xl backdrop-blur-xl sm:p-6">
              <button
                className="mb-4 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10"
                onClick={() => {
                  setSelected(null);
                  setResults([]);
                  setFilter("HM");
                  setSortBy("date");
                  setSortDir("desc");
                  setRefreshing(false);
                  setQ("");
                  setHits([]);
                }}
              >
                ← Tilbake
              </button>

              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-white/55">Utøver</div>
                  <div className="mt-1 text-4xl font-semibold tracking-tight">{selected.display_name}</div>
                  <div className="mt-1 text-sm text-white/70">
                    {selected.birth_year ? `Født ${selected.birth_year}${age ? ` • ${age} år` : ""}` : ""}
                    {club ? ` • ${club}` : ""}
                  </div>
                </div>

                {refreshing && (
                  <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70">
                    <span className="animate-spin">⟳</span>
                    Oppdaterer…
                  </div>
                )}
              </div>

              {/* Filters */}
              <div className="mt-5 flex flex-wrap gap-2">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                      filter === f.key
                        ? "border-white/25 bg-white/15 text-white"
                        : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Sort */}
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="mr-2 text-white/55">Sorter:</span>
                <button
                  onClick={() => setSortBy("date")}
                  className={`rounded-full border px-3 py-1.5 ${
                    sortBy === "date"
                      ? "border-white/25 bg-white/15 text-white"
                      : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                  }`}
                >
                  Dato
                </button>
                <button
                  onClick={() => setSortBy("time")}
                  className={`rounded-full border px-3 py-1.5 ${
                    sortBy === "time"
                      ? "border-white/25 bg-white/15 text-white"
                      : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                  }`}
                >
                  Tid
                </button>
                <button
                  onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-white/80 hover:bg-white/10"
                  title="Bytt rekkefølge"
                >
                  {sortDir === "asc" ? "↑" : "↓"}
                </button>
              </div>
            </div>

            {/* Dashboard grid */}
            <div className="mx-auto max-w-6xl pb-10">
              {/* KPI + PR + Placeholder rank */}
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                <GlassPanel
                  className="lg:col-span-7"
                  title="Oversikt"
                  subtitle="Nøkkeltall for valgt kategori og utvikling over tid."
                  right={
                    <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-white/70">
                      {FILTERS.find((f) => f.key === filter)?.label}
                    </span>
                  }
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <StatPill label="Antall" value={`${trendStats.count}`} hint="Antall resultater i filteret" />
                    <StatPill
                      label="Gjennomsnitt"
                      value={trendStats.avgT ? formatTime(trendStats.avgT) : "-"}
                      hint="Snitt-tid"
                    />
                    <StatPill label="Median" value={trendStats.medT ? formatTime(trendStats.medT) : "-"} hint="Typisk tid" />
                    <StatPill
                      label="Beste (PB)"
                      value={trendStats.best ? formatTime(trendStats.best.time_ms) : "-"}
                      hint={trendStats.best ? `${formatDate(trendStats.best.start_date)} • ${trendStats.best.event_name}` : "—"}
                    />
                    <StatPill
                      label="Siste"
                      value={trendStats.last ? formatTime(trendStats.last.time_ms) : "-"}
                      hint={trendStats.last ? `${formatDate(trendStats.last.start_date)} • ${trendStats.last.event_name}` : "—"}
                    />
                    <StatPill
                      label="Endring"
                      value={
                        trendStats.change === null
                          ? "-"
                          : `${trendStats.change > 0 ? "+" : ""}${trendStats.change.toFixed(1)}%`
                      }
                      hint={trendStats.change === null ? "Sammenligner første og siste" : "Negativt = raskere"}
                    />
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/12 bg-black/30 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-white">2026-rangering (placeholder)</div>
                      <span className="text-xs text-white/55">
                        Plan: raskeste tid i 2026 vs alle i DB (samme distanse)
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <StatPill
                        label="2026 PB"
                        value={trendStats.pb2026 ? formatTime(trendStats.pb2026.time_ms) : "-"}
                        hint={trendStats.pb2026 ? `${formatDate(trendStats.pb2026.start_date)} • ${trendStats.pb2026.event_name}` : "Ingen i 2026 (i denne distansen)"}
                      />
                      <StatPill label="Plassering" value={rank2026 ? `#${rank2026.rank}` : "—"} hint="Kommer når vi lager endpoint" />
                      <StatPill label="Av" value={rank2026 ? `${rank2026.total}` : "—"} hint="Totalt antall utøvere i ranking" />
                    </div>

                    <div className="mt-3 text-xs text-white/55">
                      Når du er klar: lag en API-route som returnerer rank basert på{" "}
                      <span className="text-white/70">min(time_ms)</span> for{" "}
                      <span className="text-white/70">year=2026</span> og valgt kategori.
                    </div>
                  </div>
                </GlassPanel>

                <GlassPanel
                  className="lg:col-span-5"
                  title="Personlige rekorder"
                  subtitle="Klikk en distanse for å bytte filter."
                >
                  <PRTable
                    prs={[
                      { ...prs.find((p) => p.cat === "5K")!, label: "5K" },
                      { ...prs.find((p) => p.cat === "10K")!, label: "10K" },
                      { ...prs.find((p) => p.cat === "HM")!, label: "HM" },
                      { ...prs.find((p) => p.cat === "M")!, label: "M" },
                      { ...prs.find((p) => p.cat === "OTHER")!, label: "OTHER" },
                    ].filter(Boolean)}
                    onPick={(c) => setFilter(c)}
                    active={filter}
                  />

                  <div className="mt-4 rounded-2xl border border-white/12 bg-black/30 p-4">
                    <div className="text-sm font-semibold text-white">Detalj: {FILTERS.find((f) => f.key === filter)?.label}</div>
                    <div className="mt-2 text-sm text-white/75">
                      PB:{" "}
                      <span className="font-semibold text-white">
                        {activePR?.best ? formatTime(activePR.best.time_ms) : "-"}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-white/55">
                      {activePR?.best
                        ? `${formatDate(activePR.best.start_date)} • ${activePR.best.event_name} • ${activePR.best.race_name}`
                        : "Ingen resultater i denne distansen ennå."}
                    </div>
                  </div>
                </GlassPanel>
              </div>

              {/* Chart + Results */}
              <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
                <GlassPanel
                  className="lg:col-span-12"
                  title="Utvikling"
                  subtitle="Trend over tid for valgt distanse (hover for detaljer)."
                  right={
                    <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-white/70">
                      {FILTERS.find((f) => f.key === filter)?.label}
                    </span>
                  }
                >
                  {showChart ? <TrendChart rows={sorted} /> : <div className="text-sm text-white/70">Ikke nok datapunkter til å vise graf.</div>}
                </GlassPanel>

                <div className="lg:col-span-12">
                  {loadingResults && (
                    <div className="rounded-2xl border border-white/15 bg-black/35 p-6 text-sm text-white/70 shadow-2xl backdrop-blur-xl">
                      Laster resultater…
                    </div>
                  )}

                  {!loadingResults && sorted.length === 0 && (
                    <div className="rounded-2xl border border-white/15 bg-black/35 p-6 text-sm text-white/70 shadow-2xl backdrop-blur-xl">
                      {refreshing ? "Laster inn resultater…" : "Ingen resultater i denne kategorien."}
                    </div>
                  )}

                  {!loadingResults && sorted.length > 0 && (
                    <div className="overflow-hidden rounded-2xl border border-white/15 bg-black/40 shadow-2xl backdrop-blur-xl">
                      <div className="sticky top-0 z-10 grid grid-cols-12 gap-0 border-b border-white/10 bg-black/40 px-5 py-3 text-[11px] font-semibold uppercase tracking-wide text-white/70 backdrop-blur-xl">
                        <div className="col-span-3">Dato</div>
                        <div className="col-span-7">Løp</div>
                        <div className="col-span-2 text-right">Tid</div>
                      </div>

                      <div className="divide-y divide-white/10">
                        {sorted.map((r, idx) => (
                          <div
                            key={idx}
                            className="group grid grid-cols-12 gap-0 bg-black/40 px-5 py-4 text-white transition hover:bg-black/50"
                          >
                            <div className="col-span-3 text-sm text-white/70">{formatDate(r.start_date)}</div>

                            <div className="col-span-7">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-white">{r.event_name}</div>
                                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                                    <div className="truncate text-xs text-white/60">{r.race_name}</div>

                                    {r.distance_category && (
                                      <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white/70">
                                        {r.distance_category}
                                      </span>
                                    )}

                                    {r.club && <span className="truncate text-[11px] text-white/50">• {r.club}</span>}
                                  </div>
                                </div>

                                <div className="hidden shrink-0 text-white/35 transition group-hover:text-white/60 sm:block">
                                  →
                                </div>
                              </div>
                            </div>

                            <div className="col-span-2 text-right">
                              <div className="text-sm font-semibold text-white">{formatTime(r.time_ms)}</div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="border-t border-white/10 bg-black/35 px-5 py-3 text-xs text-white/55">
                        Viser {sorted.length} resultat{sorted.length === 1 ? "" : "er"} i{" "}
                        {FILTERS.find((f) => f.key === filter)?.label}.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        <div className="h-24" />
      </div>
    </section>
  );
}