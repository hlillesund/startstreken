"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronRight, GitCompareArrows, Share2 } from "lucide-react";
import AthleteSearch from "@/components/AthleteSearch";
import TrendChart from "@/components/utovere/TrendChart";
import TopLeaderboards from "@/components/utovere/TopLeaderBoards";
import type { AthleteHit, AthleteResultRow } from "@/components/utovere/types";
import { fetchAthlete, fetchRanks, fetchResults, refreshFromSource, yearOf, type RankMap } from "@/components/utovere/data";
import {
  MAIN_DISTANCES,
  distanceMeters,
  formatDateShort,
  formatPace,
  formatTime,
  initials,
  mostCommon,
  pctChange,
} from "@/components/utovere/utils";
import { addRecentAthlete } from "@/lib/recent-athletes";

const YEAR = new Date().getFullYear();
const TABS = [...MAIN_DISTANCES.map((d) => ({ key: d.key as string, label: d.short })), { key: "OTHER", label: "Annet" }];

function readParams() {
  const p = new URLSearchParams(window.location.search);
  return { athleteId: p.get("athleteId"), q: p.get("q") ?? "" };
}

/* ── Search view ─────────────────────────────────────────── */
function SearchView({ initialQuery, onSelect }: { initialQuery: string; onSelect: (h: AthleteHit) => void }) {
  return (
    <>
      <div className="ss-container">
        <div className="ss-pagehead">
          <h1 className="ss-h1">Utøvere</h1>
          <p className="ss-sub">Søk blant alle løpere i databasen – se rekorder, plasseringer og utvikling.</p>
        </div>
        <div style={{ marginTop: 16, maxWidth: 720 }}>
          <AthleteSearch
            key={initialQuery}
            inline
            autoFocus={!initialQuery}
            initialQuery={initialQuery}
            limit={12}
            placeholder="Skriv et navn…"
            onSelect={onSelect}
          />
        </div>
      </div>
      <div className="ss-container">
        <section className="ss-section">
          <TopLeaderboards year={YEAR} onSelectAthlete={onSelect} />
        </section>
      </div>
    </>
  );
}

/* ── Profile view ────────────────────────────────────────── */
function ProfileSkeleton() {
  return (
    <div className="ss-container">
      <div className="ss-pagehead">
        <div className="ss-ath-head">
          <span className="ss-skel" style={{ width: 76, height: 76, borderRadius: 999 }} />
          <div style={{ flex: 1, display: "grid", gap: 10 }}>
            <span className="ss-skel" style={{ height: 30, width: "55%" }} />
            <span className="ss-skel" style={{ height: 14, width: "35%" }} />
          </div>
        </div>
      </div>
      <div className="ss-pbs" style={{ marginTop: 20 }}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="ss-skel" style={{ height: 96, borderRadius: 16 }} />
        ))}
      </div>
    </div>
  );
}

function Profile({
  athlete,
  results,
  ranks,
  loading,
  refreshing,
  onBack,
}: {
  athlete: AthleteHit;
  results: AthleteResultRow[];
  ranks: RankMap;
  loading: boolean;
  refreshing: boolean;
  onBack: () => void;
}) {
  const [filter, setFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"date" | "time">("date");
  const [copied, setCopied] = useState(false);

  const byCat = useMemo(() => {
    const m = new Map<string, AthleteResultRow[]>();
    for (const r of results) {
      const key = MAIN_DISTANCES.some((d) => d.key === r.distance_category) ? r.distance_category! : "OTHER";
      m.set(key, [...(m.get(key) ?? []), r]);
    }
    return m;
  }, [results]);

  // Default to the distance the athlete has run most
  const defaultCat = useMemo(() => {
    let best = "HM", n = -1;
    for (const d of MAIN_DISTANCES) {
      const c = byCat.get(d.key)?.length ?? 0;
      if (c > n) { n = c; best = d.key; }
    }
    return n > 0 ? best : byCat.has("OTHER") ? "OTHER" : "HM";
  }, [byCat]);
  const cat = filter ?? defaultCat;
  // "Annet" is a mix of unrelated distances: no records, trend or season stats there.
  const isOther = cat === "OTHER";

  const club = useMemo(() => mostCommon(results.map((r) => r.club)), [results]);
  const age = athlete.birth_year ? YEAR - athlete.birth_year : null;

  const rows = useMemo(() => byCat.get(cat) ?? [], [byCat, cat]);
  const meters = distanceMeters(cat);
  const pb = useMemo(() => rows.reduce<AthleteResultRow | null>((b, r) => (!b || r.time_ms < b.time_ms ? r : b), null), [rows]);

  const kpis = useMemo(() => {
    const bestIn = (y: number) =>
      rows.filter((r) => yearOf(r) === y).reduce<AthleteResultRow | null>((b, r) => (!b || r.time_ms < b.time_ms ? r : b), null);
    const sb = bestIn(YEAR);
    const lastYear = bestIn(YEAR - 1);
    const latest = rows.filter((r) => r.start_date).sort((a, b) => b.start_date!.localeCompare(a.start_date!))[0] ?? null;
    const change = sb && lastYear ? pctChange(sb.time_ms, lastYear.time_ms) : null;
    return { sb, lastYear, latest, change };
  }, [rows]);

  const sorted = useMemo(
    () =>
      rows.slice().sort((a, b) =>
        sortBy === "time" && !isOther ? a.time_ms - b.time_ms : (b.start_date ?? "").localeCompare(a.start_date ?? "")
      ),
    [rows, sortBy, isOther]
  );

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

  const genderLabel = athlete.gender === "M" ? "Herre" : athlete.gender === "F" ? "Dame" : null;

  return (
    <div className="ss-container">
      <div className="ss-pagehead">
        <button className="ss-back" onClick={onBack}>
          <ArrowLeft size={16} /> Tilbake
        </button>
        <div className="ss-pagehead-row">
          <div className="ss-ath-head">
            <span className="ss-avatar ss-avatar--xl" style={{ background: "var(--ss-ink)", color: "var(--ss-accent)" }}>
              {initials(athlete.display_name)}
            </span>
            <div style={{ minWidth: 0 }}>
              <h1 className="ss-ath-name">{athlete.display_name}</h1>
              <div className="ss-ath-meta">
                {genderLabel && <span>{genderLabel}</span>}
                {athlete.birth_year && <span>f. {athlete.birth_year}{age ? ` (${age} år)` : ""}</span>}
                {club && <span>{club}</span>}
                {results.length > 0 && <span>{results.length} løp</span>}
                {refreshing && <span className="ss-updating">Oppdaterer</span>}
              </div>
            </div>
          </div>
          <div className="ss-ath-actions">
            <Link href={`/utovere/sammenlign?ids=${athlete.id}`} className="ss-btn ss-btn--primary">
              <GitCompareArrows size={17} /> Sammenlign
            </Link>
            <button className="ss-btn" onClick={share}>
              {copied ? <Check size={17} /> : <Share2 size={17} />} {copied ? "Kopiert" : "Del"}
            </button>
          </div>
        </div>
      </div>

      {/* Personal bests */}
      <section className="ss-section" style={{ paddingTop: 20 }}>
        <div className="ss-pbs">
          {MAIN_DISTANCES.map((d) => {
            const list = byCat.get(d.key) ?? [];
            const best = list.reduce<AthleteResultRow | null>((b, r) => (!b || r.time_ms < b.time_ms ? r : b), null);
            const rank = ranks[d.key];
            return (
              <button
                key={d.key}
                className={`ss-card ss-pb${cat === d.key ? " active" : ""}${best ? "" : " is-empty"}`}
                onClick={() => best && setFilter(d.key)}
                disabled={!best}
                aria-pressed={cat === d.key}
              >
                <div className="ss-pb-dist">
                  <span>{d.label}</span>
                  {rank && (
                    <span className="ss-badge ss-badge--accent" title={`Nr. ${rank.rank} av ${rank.total} i ${YEAR}`}>
                      #{rank.rank}
                    </span>
                  )}
                </div>
                <div className="ss-pb-time">{loading ? <span className="ss-skel" style={{ display: "inline-block", width: 80, height: 22 }} /> : best ? formatTime(best.time_ms) : "—"}</div>
                <div className="ss-pb-sub">{best ? `${formatDateShort(best.start_date)} · ${list.length} løp` : "Ingen resultater"}</div>
              </button>
            );
          })}
        </div>
      </section>

      {!loading && results.length === 0 && (
        <div className="ss-card ss-empty" style={{ marginBottom: 32 }}>Ingen resultater registrert for denne utøveren ennå.</div>
      )}

      {results.length > 0 && (
        <>
          <div className="ss-seg" role="tablist" aria-label="Distanse" style={{ marginBottom: 12 }}>
            {TABS.filter((t) => byCat.has(t.key) || t.key === cat).map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={cat === t.key}
                className={`ss-seg-btn${cat === t.key ? " active" : ""}`}
                onClick={() => setFilter(t.key)}
              >
                {t.label}
                <span className="ss-seg-count">{byCat.get(t.key)?.length ?? 0}</span>
              </button>
            ))}
          </div>

          {rows.length > 0 && !isOther && (
            <div className="ss-card ss-kpis">
              <div className="ss-kpi">
                <div className="ss-kpi-label">Personlig rekord</div>
                <div className="ss-kpi-val">{pb ? formatTime(pb.time_ms) : "—"}</div>
                <div className="ss-kpi-hint">{pb ? formatPace(pb.time_ms, meters) ?? pb.event_name : "—"}</div>
              </div>
              <div className="ss-kpi">
                <div className="ss-kpi-label">Sesongbeste {YEAR}</div>
                <div className="ss-kpi-val">{kpis.sb ? formatTime(kpis.sb.time_ms) : "—"}</div>
                <div className="ss-kpi-hint">
                  {ranks[cat] ? `Nr. ${ranks[cat]!.rank} av ${ranks[cat]!.total.toLocaleString("nb-NO")} i Norge` : kpis.sb ? kpis.sb.event_name : "Ingen løp i år"}
                </div>
              </div>
              <div className="ss-kpi">
                <div className="ss-kpi-label">Siste løp</div>
                <div className="ss-kpi-val">{kpis.latest ? formatTime(kpis.latest.time_ms) : "—"}</div>
                <div className="ss-kpi-hint">{kpis.latest ? formatDateShort(kpis.latest.start_date) : "—"}</div>
              </div>
              <div className="ss-kpi">
                <div className="ss-kpi-label">Mot i fjor</div>
                <div className={`ss-kpi-val${kpis.change != null ? (kpis.change < 0 ? " good" : kpis.change > 0 ? " bad" : "") : ""}`}>
                  {kpis.change != null ? `${kpis.change < 0 ? "−" : "+"}${Math.abs(kpis.change).toFixed(1)} %` : "—"}
                </div>
                <div className="ss-kpi-hint">
                  {kpis.sb && kpis.lastYear
                    ? `${formatTime(kpis.lastYear.time_ms)} → ${formatTime(kpis.sb.time_ms)}`
                    : "Trenger løp i år og i fjor"}
                </div>
              </div>
            </div>
          )}

          {rows.length > 1 && !isOther && (
            <section className="ss-card ss-card-pad" style={{ marginTop: 12 }}>
              <h2 className="ss-h3" style={{ marginBottom: 12 }}>Utvikling</h2>
              <TrendChart rows={rows} />
            </section>
          )}

          {rows.length > 0 && (
            <section className="ss-card" style={{ marginTop: isOther ? 0 : 12, marginBottom: 32 }}>
              <div className="ss-toolbar">
                <h2 className="ss-h3">
                  {cat === "OTHER" ? "Andre distanser" : MAIN_DISTANCES.find((d) => d.key === cat)?.label}
                  <span className="ss-muted" style={{ fontWeight: 500 }}> · {rows.length} løp</span>
                </h2>
                {!isOther && (
                  <div className="ss-seg" aria-label="Sortering">
                    <button className={`ss-seg-btn${sortBy === "date" ? " active" : ""}`} onClick={() => setSortBy("date")}>Nyeste</button>
                    <button className={`ss-seg-btn${sortBy === "time" ? " active" : ""}`} onClick={() => setSortBy("time")}>Raskeste</button>
                  </div>
                )}
              </div>
              <ul className="ss-results">
                {sorted.map((r, i) => {
                  const isPb = !isOther && pb === r;
                  const gTotal = athlete.gender === "M" ? r.total_finishers_m : athlete.gender === "F" ? r.total_finishers_f : null;
                  const podium = r.rank_overall != null && r.rank_overall <= 3;
                  const place =
                    r.rank_overall != null && r.total_finishers
                      ? `${r.rank_overall}. av ${r.total_finishers.toLocaleString("nb-NO")}`
                      : null;
                  const gPlace =
                    r.rank_gender != null && gTotal
                      ? `${r.rank_gender}. ${athlete.gender === "F" ? "dame" : "herre"}`
                      : null;
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
                          {[formatDateShort(r.start_date), r.race_name !== r.event_name ? r.race_name : null, r.club]
                            .filter(Boolean)
                            .join(" · ")}
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
                  const key = `${r.race_id}-${r.time_ms}-${i}`;
                  // Fully imported races have their own page with the whole field.
                  return r.full && r.event_id ? (
                    <li key={key}>
                      <Link
                        href={`/lop/${r.event_id}?race=${r.race_id}&utover=${athlete.id}`}
                        className="ss-result ss-result--link"
                        title="Se hele resultatlisten"
                      >
                        {body}
                        <ChevronRight size={16} className="ss-result-go" />
                      </Link>
                    </li>
                  ) : (
                    <li key={key} className="ss-result">{body}</li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────── */
export default function UtoverePage() {
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [athlete, setAthlete] = useState<AthleteHit | null>(null);
  const [results, setResults] = useState<AthleteResultRow[]>([]);
  const [ranks, setRanks] = useState<RankMap>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const pushedRef = useRef(false);
  const tokenRef = useRef(0);

  const load = useCallback(async (id: string, hint?: AthleteHit) => {
    const token = ++tokenRef.current;
    const alive = () => tokenRef.current === token;
    setAthleteId(id);
    setAthlete(hint ?? null);
    setResults([]);
    setRanks({});
    setNotFound(false);
    setLoading(true);
    window.scrollTo({ top: 0 });

    const [full, res] = await Promise.all([fetchAthlete(id), fetchResults(id)]);
    if (!alive()) return;
    if (!full && !hint) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const a = full ?? hint!;
    setAthlete(a);
    setResults(res);
    setLoading(false);
    addRecentAthlete(a);
    document.title = `${a.display_name} – Startstreken`;

    fetchRanks(id, YEAR).then((r) => alive() && setRanks(r));

    setRefreshing(true);
    const changed = await refreshFromSource(id);
    if (!alive()) return;
    if (changed) {
      const fresh = await fetchResults(id);
      if (!alive()) return;
      if (fresh.length) setResults(fresh);
    }
    setRefreshing(false);
  }, []);

  const reset = useCallback(() => {
    tokenRef.current++;
    setAthleteId(null);
    setAthlete(null);
    setResults([]);
    setRanks({});
    setRefreshing(false);
    setNotFound(false);
    document.title = "Utøvere – Startstreken";
  }, []);

  // Sync with URL (initial load + back/forward)
  useEffect(() => {
    const sync = () => {
      const { athleteId: id, q } = readParams();
      setQuery(q);
      if (id) load(id);
      else reset();
      setReady(true);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [load, reset]);

  function select(hit: AthleteHit) {
    window.history.pushState(null, "", `/utovere?athleteId=${hit.id}`);
    pushedRef.current = true;
    load(hit.id, hit);
  }

  function back() {
    if (pushedRef.current) {
      window.history.back();
    } else {
      window.history.pushState(null, "", "/utovere");
      reset();
    }
  }

  return (
    <div className="ss-page">
      {!ready ? null : athleteId ? (
        notFound ? (
          <div className="ss-container">
            <div className="ss-pagehead">
              <button className="ss-back" onClick={back}><ArrowLeft size={16} /> Tilbake</button>
              <div className="ss-card ss-empty">Fant ikke utøveren.</div>
            </div>
          </div>
        ) : athlete ? (
          <Profile key={athlete.id} athlete={athlete} results={results} ranks={ranks} loading={loading} refreshing={refreshing} onBack={back} />
        ) : (
          <ProfileSkeleton />
        )
      ) : (
        <SearchView initialQuery={query} onSelect={select} />
      )}
    </div>
  );
}
