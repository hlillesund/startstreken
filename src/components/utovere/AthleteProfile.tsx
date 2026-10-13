"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import React, { useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronRight, GitCompareArrows, Share2 } from "lucide-react";
import CountUp from "@/components/ui/CountUp";
import type { AthleteHit, AthleteResultRow } from "./types";
import { yearOf, type RankMap } from "./data";
import { clubSlug } from "@/lib/club-slug";
import { MAIN_DISTANCES, distanceLabel, distanceMeters, formatDateShort, formatGap, formatPace, formatTime, mostCommon } from "./utils";
import { careerSummary, distanceMix, formatTopPercent, highlights, predictions, racesPerYear, seasonBests, topPercent } from "./insights";

const HeroGradient = dynamic(() => import("@/components/ui/HeroGradient"), { ssr: false });

const YEAR = new Date().getFullYear();
const TABS = [...MAIN_DISTANCES.map((d) => ({ key: d.key as string, label: d.short })), { key: "OTHER", label: "Annet" }];
const MIX_COLORS: Record<string, string> = { "5K": "#ffffff", "10K": "rgba(255,255,255,0.62)", HM: "#f068b7", M: "rgba(240,104,183,0.55)", OTHER: "rgba(255,255,255,0.22)" };

type R = AthleteResultRow;
const fastest = (rows: R[]) => rows.reduce<R | null>((b, r) => (!b || r.time_ms < b.time_ms ? r : b), null);

function Stat({ label, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="ss-ap-stat">
      <div className="ss-ap-stat-label">{label}</div>
      <div className="ss-ap-stat-val">{children}</div>
      {sub && <div className="ss-ap-stat-sub">{sub}</div>}
    </div>
  );
}

function sinceText(dateStr: string) {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days <= 0) return "i dag";
  if (days === 1) return "i går";
  if (days < 14) return `${days} dager siden`;
  if (days < 60) return `${Math.round(days / 7)} uker siden`;
  if (days < 365) return `${Math.round(days / 30.4)} mnd siden`;
  const y = Math.floor(days / 365);
  return y === 1 ? "1 år siden" : `${y} år siden`;
}

/* ── Season bests as horizontal bars (reads well on a phone) ── */
function SeasonBars({ rows }: { rows: R[] }) {
  const seasons = useMemo(() => seasonBests(rows), [rows]);
  if (seasons.length === 0) return null;
  const times = seasons.map((s) => s.best.time_ms);
  const fast = Math.min(...times), slow = Math.max(...times);
  return (
    <ol className="ss-sb">
      {seasons.map((s) => {
        const w = slow === fast ? 100 : 38 + (62 * (slow - s.best.time_ms)) / (slow - fast);
        const isBest = s.best.time_ms === fast;
        return (
          <li key={s.year} className={`ss-sb-row${isBest ? " is-best" : ""}`}>
            <span className="ss-sb-year">{s.year}</span>
            <span className="ss-sb-track"><span className="ss-sb-fill" style={{ width: `${w}%` }} /></span>
            <span className="ss-sb-time">{formatTime(s.best.time_ms)}</span>
            <span className={`ss-sb-delta${s.delta == null ? "" : s.delta < 0 ? " good" : s.delta > 0 ? " bad" : ""}`}>
              {s.delta == null ? "Første" : s.delta === 0 ? "±0" : formatGap(s.delta)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ResultRow({ r, athlete, isPb, meters }: { r: R; athlete: AthleteHit; isPb: boolean; meters: number | null }) {
  const gTotal = athlete.gender === "M" ? r.total_finishers_m : athlete.gender === "F" ? r.total_finishers_f : null;
  const podium = r.rank_overall != null && r.rank_overall <= 3;
  const place = r.rank_overall != null && r.total_finishers ? `${r.rank_overall}. av ${r.total_finishers.toLocaleString("nb-NO")}` : null;
  const gPlace = r.rank_gender != null && gTotal ? `${r.rank_gender}. ${athlete.gender === "F" ? "dame" : "herre"}` : null;
  const pace = formatPace(r.time_ms, meters);
  const body = (
    <>
      <div className="ss-result-main">
        <div className="ss-result-name">
          <span>{r.event_name}</span>
          {isPb && <span className="ss-badge ss-badge--accent">PB</span>}
          {podium && <span className="ss-badge ss-badge--ink">{r.rank_overall}. plass</span>}
        </div>
        <div className="ss-result-meta">
          {[formatDateShort(r.start_date), r.race_name !== r.event_name ? r.race_name : null, r.club].filter(Boolean).join(" · ")}
        </div>
      </div>
      <div className="ss-result-right">
        <div className="ss-result-time">{formatTime(r.time_ms)}</div>
        <div className="ss-result-sub">
          {[place && <span key="p" className="ss-result-place">{place}</span>, gPlace, !place ? pace : null]
            .filter(Boolean)
            .map((x, j) => (
              <React.Fragment key={j}>{j > 0 && " · "}{x}</React.Fragment>
            ))}
        </div>
      </div>
    </>
  );
  // Fully imported races have their own page with the whole field.
  return r.full && r.event_id ? (
    <li>
      <Link href={`/lop/${r.event_id}?race=${r.race_id}&utover=${athlete.id}`} className="ss-result ss-result--link" title="Se hele resultatlisten">
        {body}
        <ChevronRight size={16} className="ss-result-go" />
      </Link>
    </li>
  ) : (
    <li className="ss-result">{body}</li>
  );
}

export default function AthleteProfile({
  athlete,
  results,
  ranks,
  loading,
  refreshing,
  onBack,
}: {
  athlete: AthleteHit;
  results: R[];
  ranks: RankMap;
  loading: boolean;
  refreshing: boolean;
  onBack: () => void;
}) {
  const [filter, setFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"date" | "time">("date");
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(false);
  const focusRef = useRef<HTMLDivElement | null>(null);

  const byCat = useMemo(() => {
    const m = new Map<string, R[]>();
    for (const r of results) {
      const key = MAIN_DISTANCES.some((d) => d.key === r.distance_category) ? r.distance_category! : "OTHER";
      m.set(key, [...(m.get(key) ?? []), r]);
    }
    return m;
  }, [results]);

  // default to the distance run most often
  const defaultCat = useMemo(() => {
    let best = "HM", n = -1;
    for (const d of MAIN_DISTANCES) {
      const c = byCat.get(d.key)?.length ?? 0;
      if (c > n) { n = c; best = d.key; }
    }
    return n > 0 ? best : byCat.has("OTHER") ? "OTHER" : "HM";
  }, [byCat]);
  const cat = filter ?? defaultCat;
  const isOther = cat === "OTHER"; // a mix of distances: no records or season stats
  const rows = useMemo(() => byCat.get(cat) ?? [], [byCat, cat]);
  const meters = distanceMeters(cat);
  const pb = useMemo(() => (isOther ? null : fastest(rows)), [rows, isOther]);

  const summary = useMemo(() => careerSummary(results, YEAR), [results]);
  const hl = useMemo(() => highlights(results), [results]);
  const pred = useMemo(() => predictions(results), [results]);
  const perYear = useMemo(() => racesPerYear(results), [results]);
  const mix = useMemo(() => distanceMix(results), [results]);
  const club = useMemo(() => mostCommon(results.map((r) => r.club)), [results]);
  const lastRace = useMemo(
    () => results.filter((r) => r.start_date).sort((a, b) => b.start_date!.localeCompare(a.start_date!))[0] ?? null,
    [results]
  );

  const focus = useMemo(() => {
    const sb = fastest(rows.filter((r) => yearOf(r) === YEAR));
    const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.time_ms, 0) / rows.length) : null;
    const latest = rows.filter((r) => r.start_date).sort((a, b) => b.start_date!.localeCompare(a.start_date!))[0] ?? null;
    let bestPlace: { r: R; p: number } | null = null;
    for (const r of rows) {
      const p = topPercent(r);
      if (p != null && (!bestPlace || p < bestPlace.p)) bestPlace = { r, p };
    }
    return { sb, avg, latest, bestPlace };
  }, [rows]);

  const sorted = useMemo(
    () => rows.slice().sort((a, b) => (sortBy === "time" && !isOther ? a.time_ms - b.time_ms : (b.start_date ?? "").localeCompare(a.start_date ?? ""))),
    [rows, sortBy, isOther]
  );
  const LIMIT = 8;
  const visible = showAll ? sorted : sorted.slice(0, LIMIT);

  function pick(key: string) {
    setFilter(key);
    setShowAll(false);
    requestAnimationFrame(() => focusRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function share() {
    const url = `${window.location.origin}/utovere?athleteId=${athlete.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${athlete.display_name} – Startstreken`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // cancelled
    }
  }

  const age = athlete.birth_year ? YEAR - athlete.birth_year : null;
  const genderLabel = athlete.gender === "M" ? "Herre" : athlete.gender === "F" ? "Dame" : null;
  const [first, ...rest] = athlete.display_name.split(" ");
  const bestRank = MAIN_DISTANCES.map((d) => ({ d, r: ranks[d.key] })).filter((x) => x.r).sort((a, b) => a.r!.rank - b.r!.rank)[0];
  // best rank within the age class, shown when it says something the national rank doesn't
  const bestClass = MAIN_DISTANCES.flatMap((d) => (ranks[d.key]?.cls ? [{ d, c: ranks[d.key]!.cls! }] : []))
    .filter((x) => x.c.key !== "SEN")
    .sort((a, b) => a.c.rank / a.c.total - b.c.rank / b.c.total)[0];

  return (
    <div className="ss-container ss-ap">
      {/* ── Identity ── */}
      <header className="ss-ap-head">
        <button className="ss-back ss-intro" onClick={onBack}>
          <ArrowLeft size={16} /> Tilbake
        </button>
        <div className="ss-ap-name-wrap">
          <HeroGradient className="ss-ap-name-bg" />
          <h1 className="ss-ap-name ss-intro" style={{ "--d": "60ms" } as React.CSSProperties}>
            {first} {rest.length > 0 && <em>{rest.join(" ")}</em>}
          </h1>
        </div>
        <div className="ss-ap-meta ss-intro" style={{ "--d": "160ms" } as React.CSSProperties}>
          {[genderLabel, athlete.birth_year ? `f. ${athlete.birth_year}${age ? ` (${age} år)` : ""}` : null].filter(Boolean).map((x) => (
            <span key={String(x)}>{x}</span>
          ))}
          {club && clubSlug(club) && (
            <span>
              <Link href={`/klubber/${encodeURIComponent(clubSlug(club))}`} className="ss-club-link">{club}</Link>
            </span>
          )}
          {bestRank && <span className="ss-ap-pill">#{bestRank.r!.rank} i Norge på {bestRank.d.label.toLowerCase()} {YEAR}</span>}
          {bestClass && (
            <Link href={`/utovere/topp100?category=${bestClass.d.key}&gender=${athlete.gender === "F" ? "F" : "M"}&year=${YEAR}&klasse=${bestClass.c.key}`} className="ss-ap-pill ss-ap-pill--ghost">
              #{bestClass.c.rank} i {bestClass.c.label} på {bestClass.d.label.toLowerCase()}
            </Link>
          )}
          {refreshing && <span className="ss-updating">Oppdaterer</span>}
        </div>
        <div className="ss-ap-actions ss-intro" style={{ "--d": "240ms" } as React.CSSProperties}>
          <Link href={`/utovere/sammenlign?ids=${athlete.id}`} className="ss-btn ss-btn--primary">
            <GitCompareArrows size={17} /> Sammenlign
          </Link>
          <button className="ss-btn" onClick={share}>
            {copied ? <Check size={17} /> : <Share2 size={17} />} {copied ? "Kopiert" : "Del"}
          </button>
        </div>
      </header>

      {loading ? (
        <div className="ss-ap-stats">
          {[0, 1].map((i) => <div key={i} className="ss-skel" style={{ height: 120, borderRadius: 22 }} />)}
        </div>
      ) : results.length === 0 ? (
        <div className="ss-card ss-empty" style={{ margin: "24px 0 48px" }}>Ingen resultater registrert for denne utøveren ennå.</div>
      ) : (
        <>
          {/* ── Career and latest race ── */}
          <section className="ss-ap-stats ss-reveal ss-stagger" aria-label="Nøkkeltall">
            <Stat label="Løp" sub={`${summary.racesThisYear} i ${YEAR}`}><CountUp value={summary.races} /></Stat>
            {lastRace && (
              <Stat
                label="Siste løp"
                sub={
                  <>
                    {distanceLabel(lastRace.distance_category)} · <span className="ss-nowrap">{sinceText(lastRace.start_date!)}</span>
                    <span className="ss-ap-stat-ev">{lastRace.event_name}</span>
                  </>
                }
              >
                {formatTime(lastRace.time_ms)}
              </Stat>
            )}
          </section>

          {/* ── Records (only distances with a time) ── */}
          {MAIN_DISTANCES.some((d) => byCat.get(d.key)?.length) && (
          <section className="ss-ap-section">
            <h2 className="ss-h2 ss-reveal">Personlige <em>rekorder</em></h2>
            <div className="ss-ap-pbs ss-reveal ss-stagger">
              {MAIN_DISTANCES.map((d) => {
                const list = byCat.get(d.key) ?? [];
                const best = fastest(list);
                const rank = ranks[d.key];
                if (!best) return null;
                return (
                  <button key={d.key} className={`ss-ap-pb${cat === d.key ? " active" : ""}`} onClick={() => pick(d.key)} aria-pressed={cat === d.key}>
                    <div className="ss-ap-pb-top">
                      <span>{d.label}</span>
                      {rank && <span className="ss-badge ss-badge--accent" title={`Nr. ${rank.rank} av ${rank.total} i ${YEAR}`}>#{rank.rank}</span>}
                    </div>
                    <div className="ss-ap-pb-time">{formatTime(best.time_ms)}</div>
                    <div className="ss-ap-pb-sub">{formatPace(best.time_ms, d.meters)} · {formatDateShort(best.start_date)}</div>
                    <div className="ss-ap-pb-event">{best.event_name}</div>
                    <div className="ss-ap-pb-count">
                      {list.length} løp
                      {rank?.cls && rank.cls.key !== "SEN" && <span className="ss-ap-pb-cls">#{rank.cls.rank} i {rank.cls.label}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
          )}

          {/* ── One distance in focus ── */}
          <div className="ss-ap-focus-wrap">
          <div ref={focusRef} className="ss-ap-focus-anchor" />
          <div className="ss-ap-tabs">
            <div className="ss-seg" role="tablist" aria-label="Distanse">
              {TABS.filter((t) => byCat.has(t.key) || t.key === cat).map((t) => (
                <button key={t.key} role="tab" aria-selected={cat === t.key} className={`ss-seg-btn${cat === t.key ? " active" : ""}`} onClick={() => pick(t.key)}>
                  {t.label}
                  <span className="ss-seg-count">{byCat.get(t.key)?.length ?? 0}</span>
                </button>
              ))}
            </div>
          </div>

          <section className="ss-ap-focus" key={cat}>
            {!isOther && rows.length > 0 && (
              <div className="ss-ap-focus-grid">
                <div className="ss-card ss-ap-card ss-reveal">
                  <div className="ss-ap-card-head">
                    <h3 className="ss-ap-card-title">Sesongbeste per år</h3>
                    <span className="ss-muted">{MAIN_DISTANCES.find((d) => d.key === cat)?.label}</span>
                  </div>
                  {seasonBests(rows).length > 1 ? (
                    <SeasonBars rows={rows} />
                  ) : (
                    <>
                      <SeasonBars rows={rows} />
                      <p className="ss-ap-note">Løp distansen i flere sesonger for å se utviklingen år for år.</p>
                    </>
                  )}
                </div>
                <div className="ss-card ss-ap-card ss-ap-facts ss-reveal" style={{ "--d": "100ms" } as React.CSSProperties}>
                  <div className="ss-ap-fact">
                    <span>Personlig rekord</span>
                    <b>{pb ? formatTime(pb.time_ms) : "—"}</b>
                    <small>{pb ? `${formatPace(pb.time_ms, meters)} · ${pb.event_name}` : ""}</small>
                  </div>
                  <div className="ss-ap-fact">
                    <span>Sesongbeste {YEAR}</span>
                    <b>{focus.sb ? formatTime(focus.sb.time_ms) : "—"}</b>
                    <small>
                      {ranks[cat]
                        ? `Nr. ${ranks[cat]!.rank} av ${ranks[cat]!.total.toLocaleString("nb-NO")} i Norge${ranks[cat]!.cls && ranks[cat]!.cls!.key !== "SEN" ? ` · nr. ${ranks[cat]!.cls!.rank} i ${ranks[cat]!.cls!.label}` : ""}`
                        : focus.sb ? focus.sb.event_name : "Ingen løp i år"}
                    </small>
                  </div>
                  <div className="ss-ap-fact">
                    <span>Snittid</span>
                    <b>{focus.avg ? formatTime(focus.avg) : "—"}</b>
                    <small>over {rows.length} løp</small>
                  </div>
                  <div className="ss-ap-fact">
                    <span>Beste plassering</span>
                    <b>{focus.bestPlace ? formatTopPercent(focus.bestPlace.p) : "—"}</b>
                    <small>{focus.bestPlace ? `${focus.bestPlace.r.rank_overall}. av ${focus.bestPlace.r.total_finishers?.toLocaleString("nb-NO")} · ${focus.bestPlace.r.event_name}` : "Ingen fullstendige resultatlister"}</small>
                  </div>
                </div>
              </div>
            )}

            {rows.length > 0 && (
              <div className="ss-card ss-reveal" style={{ marginTop: 12 }}>
                <div className="ss-toolbar">
                  <h3 className="ss-ap-card-title">
                    {isOther ? "Andre distanser" : "Alle løp"}
                    <span className="ss-muted"> · {rows.length}</span>
                  </h3>
                  {!isOther && (
                    <div className="ss-seg" aria-label="Sortering">
                      <button className={`ss-seg-btn${sortBy === "date" ? " active" : ""}`} onClick={() => setSortBy("date")}>Nyeste</button>
                      <button className={`ss-seg-btn${sortBy === "time" ? " active" : ""}`} onClick={() => setSortBy("time")}>Raskeste</button>
                    </div>
                  )}
                </div>
                <ul className="ss-results">
                  {visible.map((r, i) => (
                    <ResultRow key={`${r.race_id}-${r.time_ms}-${i}`} r={r} athlete={athlete} isPb={pb === r} meters={meters} />
                  ))}
                </ul>
                {sorted.length > LIMIT && (
                  <div className="ss-lb-foot">
                    <button className="ss-btn ss-btn--sm" onClick={() => setShowAll((v) => !v)}>
                      {showAll ? "Vis færre" : `Vis alle ${sorted.length}`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
          </div>

          {/* ── Highlights ── */}
          <section className="ss-ap-section">
            <h2 className="ss-h2 ss-reveal">Verdt å <em>vite</em></h2>
            <div className="ss-ap-hl ss-reveal ss-stagger">
              {hl.bestPlace && (
                <div className="ss-ap-hl-card">
                  <span className="ss-ap-hl-label">Beste plassering</span>
                  <b className="ss-ap-hl-val">{formatTopPercent(hl.bestPlace.p).replace("topp", "Topp")}</b>
                  <span className="ss-ap-hl-sub">{hl.bestPlace.r.rank_overall}. av {hl.bestPlace.r.total_finishers?.toLocaleString("nb-NO")} i {hl.bestPlace.r.event_name}</span>
                </div>
              )}
              {hl.fastestPace && (
                <div className="ss-ap-hl-card">
                  <span className="ss-ap-hl-label">Raskeste fart</span>
                  <b className="ss-ap-hl-val">{formatPace(hl.fastestPace.r.time_ms, distanceMeters(hl.fastestPace.r.distance_category))}</b>
                  <span className="ss-ap-hl-sub">{MAIN_DISTANCES.find((d) => d.key === hl.fastestPace!.r.distance_category)?.label} · {hl.fastestPace.r.event_name}</span>
                </div>
              )}
              {hl.favourite && (
                <div className="ss-ap-hl-card">
                  <span className="ss-ap-hl-label">Favorittløp</span>
                  <b className="ss-ap-hl-val">{hl.favourite.n} ganger</b>
                  <span className="ss-ap-hl-sub">{hl.favourite.name}</span>
                </div>
              )}
              {hl.busiest && (
                <div className="ss-ap-hl-card">
                  <span className="ss-ap-hl-label">Travleste sesong</span>
                  <b className="ss-ap-hl-val">{hl.busiest.year}</b>
                  <span className="ss-ap-hl-sub">{hl.busiest.n} løp</span>
                </div>
              )}
            </div>
          </section>

          {/* ── What the records suggest ── */}
          {pred && (
            <section className="ss-ap-section">
              <h2 className="ss-h2 ss-reveal">Hva tidene <em>tilsier</em></h2>
              <p className="ss-sub ss-reveal">
                Estimat fra {pred.base.d.label.toLowerCase()}-rekorden ({formatTime(pred.base.pb.time_ms)}), regnet om med Riegels formel. En pekepinn, ikke en fasit.
              </p>
              <ul className="ss-card ss-ap-pred ss-reveal ss-stagger">
                {pred.rows.map((row) => (
                  <li key={row.d.key} className={row.isBase ? "is-base" : undefined}>
                    <span className="ss-ap-pred-dist">{row.d.label}</span>
                    <span className="ss-ap-pred-est">
                      {row.isBase ? formatTime(row.pb!.time_ms) : `≈ ${formatTime(row.estimate)}`}
                      <small>{row.isBase ? "Grunnlag" : formatPace(row.estimate, row.d.meters)}</small>
                    </span>
                    <span className="ss-ap-pred-pb">
                      {row.isBase ? "" : row.pb ? (
                        <>
                          PB {formatTime(row.pb.time_ms)}
                          <small>{row.pb.time_ms <= row.estimate ? "raskere enn estimatet" : `${formatGap(row.pb.time_ms - row.estimate)} til estimatet`}</small>
                        </>
                      ) : (
                        <small>Ikke løpt</small>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── Activity ── */}
          {perYear.length > 0 && (
            <section className="ss-ap-section">
              <h2 className="ss-h2 ss-reveal">Løp <em>per år</em></h2>
              <div className="ss-card ss-ap-card ss-reveal">
                <div className="ss-ap-cols" style={{ "--n": perYear.length } as React.CSSProperties}>
                  {(() => {
                    const max = Math.max(...perYear.map((p) => p.n), 1);
                    return perYear.map((p) => (
                      <div key={p.year} className={`ss-ap-col${p.year === YEAR ? " is-now" : ""}`}>
                        <span className="ss-ap-col-n">{p.n || ""}</span>
                        <span className="ss-ap-col-bar" style={{ height: `${Math.max(p.n ? 6 : 2, (p.n / max) * 100)}%` }} />
                        <span className="ss-ap-col-year">{String(p.year).slice(2)}</span>
                      </div>
                    ));
                  })()}
                </div>
                {mix.length > 1 && (
                  <>
                    <div className="ss-ap-mix" aria-hidden="true">
                      {mix.map((m) => (
                        <span key={m.key} style={{ flexGrow: m.n, background: MIX_COLORS[m.key] }} />
                      ))}
                    </div>
                    <div className="ss-legend" style={{ marginTop: 12 }}>
                      {mix.map((m) => (
                        <span key={m.key}><span className="ss-dot" style={{ background: MIX_COLORS[m.key] }} />{m.label} · {m.n}</span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </section>
          )}
          <div style={{ height: 32 }} />
        </>
      )}
    </div>
  );
}
