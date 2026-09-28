"use client";

import Link from "next/link";
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, GitCompareArrows, Link2, Plus, X } from "lucide-react";
import AthleteSearch from "@/components/AthleteSearch";
import TimeChart from "@/components/ui/TimeChart";
import type { AthleteHit, AthleteResultRow } from "@/components/utovere/types";
import { bestByCategory, fetchAthlete, fetchRanks, fetchResults, yearOf, type RankMap } from "@/components/utovere/data";
import {
  MAIN_DISTANCES,
  distanceLabel,
  formatDateShort,
  formatGap,
  formatPace,
  formatTime,
  initials,
  mostCommon,
} from "@/components/utovere/utils";
import { useRecentAthletes } from "@/lib/recent-athletes";

const YEAR = new Date().getFullYear();
const MAX = 4;
const COLORS = ["#2563eb", "#e11d48", "#059669", "#d97706"];

type Loaded = { hit: AthleteHit; results: AthleteResultRow[]; ranks: RankMap; club: string | null };
type Slot = { id: string; color: string; data: Loaded | null; failed?: boolean };
type SharedRace = {
  race_id: string;
  event_name: string;
  race_name: string;
  start_date: string | null;
  category: string | null;
  /** fastest result per slot index (null = did not run) */
  results: (AthleteResultRow | null)[];
};

function parseIds(raw: string | null) {
  return [...new Set((raw ?? "").split(",").map((s) => s.trim()).filter(Boolean))].slice(0, MAX);
}

function writeIds(ids: string[]) {
  const url = ids.length ? `/utovere/sammenlign?ids=${ids.join(",")}` : "/utovere/sammenlign";
  window.history.replaceState(null, "", url);
}

function barWidth(t: number, min: number) {
  return Math.max(10, 100 - (t / min - 1) * 300);
}

/* ── Sub components ─────────────────────────────────────── */
function Who({ slot }: { slot: Slot }) {
  return (
    <>
      <span className="ss-dot" style={{ background: slot.color }} />
      <span>{slot.data?.hit.display_name ?? "…"}</span>
    </>
  );
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="ss-section-head">
      <div>
        <h2 className="ss-h2">{title}</h2>
        {sub && <p className="ss-sub">{sub}</p>}
      </div>
    </div>
  );
}

function HeadToHead({ slots, shared }: { slots: Slot[]; shared: SharedRace[] }) {
  const pairs = useMemo(() => {
    const out: { a: number; b: number; wa: number; wb: number; ties: number; n: number }[] = [];
    for (let a = 0; a < slots.length; a++)
      for (let b = a + 1; b < slots.length; b++) {
        let wa = 0, wb = 0, ties = 0, n = 0;
        for (const r of shared) {
          const ra = r.results[a], rb = r.results[b];
          if (!ra || !rb) continue;
          n++;
          if (ra.time_ms < rb.time_ms) wa++;
          else if (rb.time_ms < ra.time_ms) wb++;
          else ties++;
        }
        out.push({ a, b, wa, wb, ties, n });
      }
    return out;
  }, [slots, shared]);

  if (slots.length === 2) {
    const p = pairs[0];
    const A = slots[0], B = slots[1];
    return (
      <div className="ss-card">
        <div className="ss-h2h">
          <div className="ss-h2h-side">
            <span className="ss-avatar" style={{ background: A.color, color: "#fff" }}>{initials(A.data!.hit.display_name)}</span>
            <span className="ss-h2h-name">{A.data!.hit.display_name}</span>
          </div>
          <div className="ss-h2h-score">
            <span style={{ color: p.wa > p.wb ? A.color : undefined }}>{p.wa}</span>
            <span className="sep">–</span>
            <span style={{ color: p.wb > p.wa ? B.color : undefined }}>{p.wb}</span>
          </div>
          <div className="ss-h2h-side">
            <span className="ss-avatar" style={{ background: B.color, color: "#fff" }}>{initials(B.data!.hit.display_name)}</span>
            <span className="ss-h2h-name">{B.data!.hit.display_name}</span>
          </div>
        </div>
        {p.n > 0 ? (
          <>
            <div className="ss-h2h-bar" aria-hidden="true">
              <div style={{ width: `${(p.wa / p.n) * 100}%`, background: A.color }} />
              <div style={{ width: `${(p.ties / p.n) * 100}%`, background: "var(--ss-surface-3)" }} />
              <div style={{ width: `${(p.wb / p.n) * 100}%`, background: B.color }} />
            </div>
            <div className="ss-h2h-foot">
              {p.n} felles løp{p.ties ? ` · ${p.ties} på likt` : ""}
            </div>
          </>
        ) : (
          <div className="ss-h2h-foot">Ingen felles løp registrert ennå.</div>
        )}
      </div>
    );
  }

  return (
    <div className="ss-card">
      <ul className="ss-pairs">
        {pairs.map((p) => (
          <li key={`${p.a}-${p.b}`} className="ss-pair">
            <span className="ss-pair-side"><Who slot={slots[p.a]} /></span>
            <span className="ss-pair-score">
              {p.n ? (
                <>
                  <span style={{ color: p.wa > p.wb ? slots[p.a].color : undefined }}>{p.wa}</span>
                  <span className="dim"> – </span>
                  <span style={{ color: p.wb > p.wa ? slots[p.b].color : undefined }}>{p.wb}</span>
                </>
              ) : (
                <span className="dim" style={{ fontSize: 13 }}>ingen</span>
              )}
            </span>
            <span className="ss-pair-side ss-pair-side--r">
              <span>{slots[p.b].data!.hit.display_name}</span>
              <span className="ss-dot" style={{ background: slots[p.b].color }} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PersonalBests({ slots }: { slots: Slot[] }) {
  const pbs = useMemo(() => slots.map((s) => bestByCategory(s.data!.results)), [slots]);
  const dists = MAIN_DISTANCES.filter((d) => pbs.some((m) => m.has(d.key)));
  if (dists.length === 0) return <div className="ss-card ss-empty">Ingen resultater på standarddistansene.</div>;

  return (
    <div className="ss-cmp-dists">
      {dists.map((d) => {
        const rows = slots
          .map((s, i) => ({ s, r: pbs[i].get(d.key) ?? null }))
          .sort((a, b) => (a.r?.time_ms ?? Infinity) - (b.r?.time_ms ?? Infinity));
        const min = rows[0].r!.time_ms;
        const leaders = rows.filter((x) => x.r?.time_ms === min).length;
        return (
          <div key={d.key} className="ss-card">
            <div className="ss-cmp-dist-head">
              <h3 className="ss-h3">{d.label}</h3>
            </div>
            <ul className="ss-cmp-rows">
              {rows.map(({ s, r }) => (
                <li key={s.id} className="ss-cmp-row">
                  <span className="ss-cmp-row-who"><Who slot={s} /></span>
                  {r ? (
                    <span className="ss-cmp-row-val">
                      <span className={r.time_ms === min && leaders === 1 ? "best" : undefined}>{formatTime(r.time_ms)}</span>
                      {r.time_ms > min && <small>{formatGap(r.time_ms - min)}</small>}
                    </span>
                  ) : (
                    <span className="ss-cmp-row-none">—</span>
                  )}
                  {r && (
                    <>
                      <div className="ss-cmp-row-bar">
                        <div style={{ width: `${barWidth(r.time_ms, min)}%`, background: s.color }} />
                      </div>
                      <div className="ss-cmp-row-sub">
                        {[formatPace(r.time_ms, d.meters), r.event_name, yearOf(r)].filter(Boolean).join(" · ")}
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function Rankings({ slots }: { slots: Slot[] }) {
  const dists = MAIN_DISTANCES.filter((d) => slots.some((s) => s.data!.ranks[d.key]));
  if (dists.length === 0) return null;
  return (
    <section className="ss-section">
      <SectionHead title={`Rangering ${YEAR}`} sub="Plassering på årets norske statistikk (beste tid per utøver)." />
      <div className="ss-cmp-dists">
        {dists.map((d) => {
          const rows = slots
            .map((s) => ({ s, r: s.data!.ranks[d.key] ?? null }))
            .sort((a, b) => (a.r?.rank ?? Infinity) - (b.r?.rank ?? Infinity));
          const best = rows[0].r!.rank;
          return (
            <div key={d.key} className="ss-card">
              <div className="ss-cmp-dist-head">
                <h3 className="ss-h3">{d.label}</h3>
                <span className="ss-muted" style={{ fontSize: 12 }}>av {rows[0].r!.total.toLocaleString("nb-NO")}</span>
              </div>
              <ul className="ss-cmp-rows">
                {rows.map(({ s, r }) => (
                  <li key={s.id} className="ss-cmp-row">
                    <span className="ss-cmp-row-who"><Who slot={s} /></span>
                    {r ? (
                      <span className="ss-cmp-row-val">
                        <span className={r.rank === best ? "best" : undefined}>#{r.rank}</span>
                      </span>
                    ) : (
                      <span className="ss-cmp-row-none">Ikke rangert</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Progression({ slots }: { slots: Slot[] }) {
  // distances where at least two athletes have results, else any with results
  const options = useMemo(() => {
    const count = (k: string) => slots.filter((s) => s.data!.results.some((r) => r.distance_category === k)).length;
    const two = MAIN_DISTANCES.filter((d) => count(d.key) >= 2);
    return two.length ? two : MAIN_DISTANCES.filter((d) => count(d.key) >= 1);
  }, [slots]);
  // default to the distance with the most season-best data points
  const defaultCat = useMemo(() => {
    let best: string | undefined, n = -1;
    for (const o of options) {
      const pts = slots.reduce(
        (sum, s) => sum + new Set(s.data!.results.filter((r) => r.distance_category === o.key).map(yearOf)).size,
        0
      );
      if (pts > n) { n = pts; best = o.key; }
    }
    return best;
  }, [options, slots]);
  const [picked, setPicked] = useState<string | null>(null);
  const cat = picked && options.some((o) => o.key === picked) ? picked : defaultCat;

  const perSlot = useMemo(() => {
    return slots.map((s) => {
      const byYear = new Map<number, AthleteResultRow>();
      for (const r of s.data!.results) {
        if (r.distance_category !== cat) continue;
        const y = yearOf(r);
        if (!y) continue;
        const cur = byYear.get(y);
        if (!cur || r.time_ms < cur.time_ms) byYear.set(y, r);
      }
      return byYear;
    });
  }, [slots, cat]);

  if (!cat) return null;
  const years = [...new Set(perSlot.flatMap((m) => [...m.keys()]))].sort((a, b) => b - a);
  const series = slots
    .map((s, i) => ({
      id: s.id,
      name: s.data!.hit.display_name,
      color: s.color,
      points: [...perSlot[i].entries()].map(([y, r]) => ({ x: y, y: r.time_ms, label: r.event_name, sub: formatDateShort(r.start_date) })),
    }))
    .filter((s) => s.points.length > 0);

  return (
    <section className="ss-section">
      <SectionHead title="Utvikling" sub="Sesongbeste per år." />
      <div className="ss-card">
        <div className="ss-toolbar">
          <div className="ss-seg" role="tablist" aria-label="Distanse">
            {options.map((d) => (
              <button key={d.key} role="tab" aria-selected={cat === d.key} className={`ss-seg-btn${cat === d.key ? " active" : ""}`} onClick={() => setPicked(d.key)}>
                {d.short}
              </button>
            ))}
          </div>
          <div className="ss-legend">
            {series.map((s) => (
              <span key={s.id}><span className="ss-dot" style={{ background: s.color }} />{s.name.split(" ")[0]}</span>
            ))}
          </div>
        </div>
        {years.length > 1 || series.length > 1 ? (
          <div style={{ padding: "16px 14px 8px" }}>
            <TimeChart series={series} xType="year" height={220} />
          </div>
        ) : null}
        <div className="ss-table-wrap">
          <table className="ss-table">
            <thead>
              <tr>
                <th>År</th>
                {slots.map((s) => (
                  <th key={s.id} className="r">
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span className="ss-dot" style={{ background: s.color, width: 8, height: 8 }} />
                      {s.data!.hit.display_name.split(" ")[0]}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {years.map((y) => {
                const times = perSlot.map((m) => m.get(y)?.time_ms ?? null);
                const valid = times.filter((t): t is number => t != null);
                const min = Math.min(...valid);
                const unique = valid.filter((t) => t === min).length === 1 && valid.length > 1;
                return (
                  <tr key={y}>
                    <td style={{ fontWeight: 700 }}>{y}</td>
                    {times.map((t, i) => (
                      <td key={i} className={`r${t === min && unique ? " best" : ""}`}>{t != null ? formatTime(t) : <span className="ss-muted">—</span>}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function SharedRaces({ slots, shared }: { slots: Slot[]; shared: SharedRace[] }) {
  const [cat, setCat] = useState<string>("ALL");
  const [limit, setLimit] = useState(8);
  const cats = MAIN_DISTANCES.filter((d) => shared.some((r) => r.category === d.key));
  const hasOther = shared.some((r) => !MAIN_DISTANCES.some((d) => d.key === r.category));
  const list = shared.filter((r) =>
    cat === "ALL" ? true : cat === "OTHER" ? !MAIN_DISTANCES.some((d) => d.key === r.category) : r.category === cat
  );

  return (
    <section className="ss-section">
      <SectionHead title="Felles løp" sub={shared.length ? `${shared.length} løp der minst to av dem har stilt til start.` : undefined} />
      {shared.length === 0 ? (
        <div className="ss-card ss-empty">Ingen felles løp registrert ennå.</div>
      ) : (
        <div className="ss-card">
          {(cats.length > 1 || (cats.length && hasOther)) && (
            <div className="ss-toolbar">
              <div className="ss-chips">
                <button className={`ss-chip${cat === "ALL" ? " active" : ""}`} onClick={() => setCat("ALL")}>Alle</button>
                {cats.map((d) => (
                  <button key={d.key} className={`ss-chip${cat === d.key ? " active" : ""}`} onClick={() => setCat(d.key)}>{d.short}</button>
                ))}
                {hasOther && (
                  <button className={`ss-chip${cat === "OTHER" ? " active" : ""}`} onClick={() => setCat("OTHER")}>Annet</button>
                )}
              </div>
            </div>
          )}
          {list.slice(0, limit).map((race) => {
            const rows = race.results
              .map((r, i) => ({ r, s: slots[i] }))
              .filter((x): x is { r: AthleteResultRow; s: Slot } => x.r != null)
              .sort((a, b) => a.r.time_ms - b.r.time_ms);
            const win = rows[0].r.time_ms;
            const soleWinner = rows.filter((x) => x.r.time_ms === win).length === 1;
            return (
              <div key={race.race_id} className="ss-race">
                <div className="ss-race-head">
                  <div style={{ minWidth: 0 }}>
                    <div className="ss-race-name">{race.event_name}</div>
                    <div className="ss-race-meta">
                      {[formatDateShort(race.start_date), distanceLabel(race.category), race.race_name !== race.event_name ? race.race_name : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                </div>
                <ol className="ss-race-rows">
                  {rows.map(({ r, s }, i) => (
                    <li key={s.id} className={`ss-race-row${i === 0 && soleWinner ? " win" : ""}`}>
                      <span className="ss-race-pos">{i + 1}</span>
                      <span className="ss-race-who"><Who slot={s} /></span>
                      <span className="ss-race-time">{formatTime(r.time_ms)}</span>
                      <span className="ss-race-gap">
                        {r.time_ms === win ? (r.rank_overall ? `#${r.rank_overall}` : "") : formatGap(r.time_ms - win)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
          {list.length > limit && (
            <div className="ss-lb-foot">
              <button className="ss-btn ss-btn--sm" onClick={() => setLimit((l) => l + 10)}>
                Vis flere ({list.length - limit})
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ── Page ────────────────────────────────────────────────── */
export default function Page() {
  return (
    <Suspense fallback={<div className="ss-page" />}>
      <ComparePage />
    </Suspense>
  );
}

function ComparePage() {
  const searchParams = useSearchParams();
  // each athlete keeps its colour for as long as it's in the comparison
  const [entries, setEntries] = useState<{ id: string; color: string }[]>(() =>
    parseIds(searchParams.get("ids")).map((id, i) => ({ id, color: COLORS[i] }))
  );
  const [cache, setCache] = useState<Record<string, Loaded | "failed">>({});
  const recent = useRecentAthletes();
  const [copied, setCopied] = useState(false);
  const requested = useRef(new Set<string>());
  const ready = true;

  const ensureLoaded = useCallback((id: string, hint?: AthleteHit) => {
    if (requested.current.has(id)) return;
    requested.current.add(id);
    Promise.all([hint ? Promise.resolve(hint) : fetchAthlete(id), fetchResults(id), fetchRanks(id, YEAR)]).then(
      ([hit, results, ranks]) => {
        setCache((c) => ({
          ...c,
          [id]: hit ? { hit, results, ranks, club: mostCommon(results.map((r) => r.club)) } : "failed",
        }));
        // enrich a partial hint (e.g. missing birth year)
        if (hint && hint.birth_year == null) {
          fetchAthlete(id).then((full) => {
            if (full) setCache((c) => (c[id] && c[id] !== "failed" ? { ...c, [id]: { ...(c[id] as Loaded), hit: full } } : c));
          });
        }
      }
    );
  }, []);

  const ids = useMemo(() => entries.map((e) => e.id), [entries]);

  useEffect(() => {
    ids.forEach((id) => ensureLoaded(id));
  }, [ids, ensureLoaded]);

  useEffect(() => {
    writeIds(ids);
    const names = ids.map((id) => cache[id]).filter((x): x is Loaded => !!x && x !== "failed").map((x) => x.hit.display_name);
    document.title = names.length >= 2 ? `${names.join(" vs ")} – Startstreken` : "Sammenlign utøvere – Startstreken";
  }, [ids, cache]);

  function add(hit: AthleteHit) {
    setEntries((prev) => {
      if (prev.some((e) => e.id === hit.id) || prev.length >= MAX) return prev;
      const used = new Set(prev.map((e) => e.color));
      return [...prev, { id: hit.id, color: COLORS.find((c) => !used.has(c)) ?? COLORS[0] }];
    });
    ensureLoaded(hit.id, hit);
  }
  function remove(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (cache[id] === "failed") requested.current.delete(id); // allow a retry later
  }

  const slots = useMemo<Slot[]>(
    () =>
      entries.map(({ id, color }) => {
        const c = cache[id];
        return { id, color, data: c && c !== "failed" ? c : null, failed: c === "failed" };
      }),
    [entries, cache]
  );
  const ready2 = useMemo(() => slots.filter((s) => s.data), [slots]);
  const allLoaded = slots.every((s) => s.data || s.failed);

  const shared = useMemo<SharedRace[]>(() => {
    if (ready2.length < 2) return [];
    const map = new Map<string, SharedRace>();
    ready2.forEach((s, idx) => {
      for (const r of s.data!.results) {
        if (!r.race_id) continue;
        let e = map.get(r.race_id);
        if (!e) {
          e = { race_id: r.race_id, event_name: r.event_name, race_name: r.race_name, start_date: r.start_date, category: r.distance_category, results: new Array(ready2.length).fill(null) };
          map.set(r.race_id, e);
        }
        const cur = e.results[idx];
        if (!cur || r.time_ms < cur.time_ms) e.results[idx] = r;
      }
    });
    return [...map.values()]
      .filter((e) => e.results.filter(Boolean).length >= 2)
      .sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? ""));
  }, [ready2]);

  const wins = useMemo(() => {
    const w = new Array(ready2.length).fill(0);
    for (const r of shared) {
      const times = r.results.map((x) => x?.time_ms ?? Infinity);
      const min = Math.min(...times);
      if (times.filter((t) => t === min).length === 1) w[times.indexOf(min)]++;
    }
    return w;
  }, [shared, ready2.length]);

  async function copyLink() {
    try {
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: document.title, url: window.location.href });
        return;
      }
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // cancelled
    }
  }

  const suggestions = recent.filter((r) => !ids.includes(r.id)).slice(0, 6);

  return (
    <div className="ss-page">
      <div className="ss-container">
        <div className="ss-pagehead">
          <div className="ss-pagehead-row">
            <div>
              <h1 className="ss-h1">Sammenlign utøvere</h1>
              <p className="ss-sub">Velg opptil {MAX} løpere og se rekorder, innbyrdes oppgjør og utvikling side om side.</p>
            </div>
            {ids.length >= 2 && (
              <button className="ss-btn" onClick={copyLink}>
                {copied ? <Check size={17} /> : <Link2 size={17} />} {copied ? "Lenke kopiert" : "Del sammenligning"}
              </button>
            )}
          </div>
        </div>

        {/* Picker */}
        <section className="ss-section" style={{ paddingTop: 16, paddingBottom: 8 }}>
          <div className="ss-cmp-picker">
            {ids.length > 0 && (
              <div className="ss-cmp-chips">
                {slots.map((s) => (
                  <span key={s.id} className="ss-cmp-chip">
                    <span className="ss-dot" style={{ background: s.color }} />
                    <span className="ss-cmp-chip-name">{s.data?.hit.display_name ?? (s.failed ? "Ukjent utøver" : "Laster…")}</span>
                    <button className="ss-cmp-chip-x" onClick={() => remove(s.id)} aria-label={`Fjern ${s.data?.hit.display_name ?? "utøver"}`}>
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {ids.length < MAX ? (
              <div style={{ maxWidth: 560 }}>
                <AthleteSearch
                  clearOnSelect
                  exclude={ids}
                  onSelect={add}
                  placeholder={ids.length === 0 ? "Søk etter første utøver…" : "Legg til utøver…"}
                />
              </div>
            ) : (
              <p className="ss-sub" style={{ margin: 0 }}>Maks {MAX} utøvere. Fjern én for å legge til en ny.</p>
            )}
          </div>
        </section>

        {ids.length < 2 && ready && (
          <section className="ss-section">
            <div className="ss-card ss-cmp-empty">
              <span className="ss-cmp-empty-icon"><GitCompareArrows size={26} /></span>
              <h2 className="ss-h2">{ids.length === 0 ? "Hvem vil du sammenligne?" : "Legg til en utøver til"}</h2>
              <p className="ss-sub" style={{ maxWidth: 420, margin: "6px auto 0" }}>
                {ids.length === 0
                  ? "Søk opp to eller flere løpere over for å se hvem som er raskest – og hvem som vinner når de møtes."
                  : `Søk opp noen å sammenligne ${slots[0]?.data?.hit.display_name ?? "utøveren"} med.`}
              </p>
              {suggestions.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div className="ss-eyebrow" style={{ marginBottom: 10 }}>Nylig sett</div>
                  <div className="ss-cmp-chips" style={{ justifyContent: "center" }}>
                    {suggestions.map((h) => (
                      <button key={h.id} className="ss-chip" onClick={() => add(h)}>
                        <Plus size={14} /> {h.display_name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* People */}
        {ids.length > 0 && (
          <section className="ss-section" style={{ paddingTop: ids.length < 2 ? 0 : 20 }}>
            <div className="ss-cmp-people" data-n={ids.length} style={{ "--n": Math.max(2, ids.length) } as React.CSSProperties}>
              {slots.map((s) => {
                const idx = ready2.indexOf(s);
                const d = s.data;
                return (
                  <div key={s.id} className="ss-card ss-cmp-person" style={{ "--c": s.color } as React.CSSProperties}>
                    <div className="ss-cmp-person-top">
                      <span className="ss-avatar" style={{ background: s.color, color: "#fff" }}>
                        {d ? initials(d.hit.display_name) : ""}
                      </span>
                      {d ? (
                        <Link href={`/utovere?athleteId=${s.id}`} className="ss-cmp-person-name">{d.hit.display_name}</Link>
                      ) : (
                        <span className="ss-skel" style={{ height: 16, flex: 1 }} />
                      )}
                    </div>
                    <div className="ss-cmp-person-meta">
                      {d
                        ? [d.hit.gender === "M" ? "Herre" : d.hit.gender === "F" ? "Dame" : null, d.hit.birth_year ? `f. ${d.hit.birth_year}` : null, d.club]
                            .filter(Boolean)
                            .join(" · ") || "—"
                        : s.failed
                          ? "Kunne ikke laste utøveren"
                          : " "}
                    </div>
                    <div className="ss-cmp-person-stats">
                      <div className="ss-cmp-person-stat">
                        <b>{d ? d.results.length : "–"}</b>
                        <span>løp</span>
                      </div>
                      {ids.length >= 2 && (
                        <div className="ss-cmp-person-stat">
                          <b style={{ color: s.color }}>{idx >= 0 && shared.length ? wins[idx] : "–"}</b>
                          <span>seire innbyrdes</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {ids.length >= 2 && !allLoaded && (
          <div className="ss-card ss-empty" style={{ marginBottom: 32 }}>Henter resultater…</div>
        )}

        {ids.length >= 2 && allLoaded && ready2.length >= 2 && (
          <>
            <section className="ss-section">
              <SectionHead title="Innbyrdes oppgjør" sub="Hvem var raskest når de løp samme løp." />
              <HeadToHead slots={ready2} shared={shared} />
            </section>

            <section className="ss-section">
              <SectionHead title="Personlige rekorder" sub="Beste registrerte tid på hver distanse." />
              <PersonalBests slots={ready2} />
            </section>

            <Rankings slots={ready2} />
            <Progression slots={ready2} />
            <SharedRaces slots={ready2} shared={shared} />
            <div style={{ height: 24 }} />
          </>
        )}
      </div>
    </div>
  );
}
