"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, fmtDateTime, fmtNum, sourceLabel, SOURCES, Spinner, StatusBadge } from "./shared";

type QueueItem = {
  id: string;
  source_slug: string;
  source_event_id: string;
  name: string | null;
  event_date: string | null;
  location: string | null;
  sport: string | null;
  relevance: string;
  status: string;
  approved: boolean | null;
  attempts: number;
  last_error: string | null;
  next_attempt_at: string;
  imported_at: string | null;
  refresh_at: string | null;
  result_count: number | null;
  event_id: string | null;
  url: string | null;
  meta: {
    hasResults?: boolean | null;
    preexisting?: boolean;
    norwegians?: number;
    dateEstimated?: boolean;
    dateSource?: string;
  } | null;
};

type CrawlRun = { id: string; trigger: string; status: string; started_at: string; finished_at: string | null; error: string | null; stats: CrawlStats | null };
type CrawlStats = {
  discovery?: Record<string, { found: number; added: number; alreadyImported: number; error?: string }> | null;
  processing?: { processed: number; imported: number; results: number; failed: number; remaining: number } | null;
  durationMs?: number;
};
type QueueResponse = {
  items: QueueItem[];
  total: number;
  page: number;
  pages: number;
  counts: Record<string, number>;
  lastCrawl: CrawlRun | null;
  due: number;
};
type ProcessResult = {
  processed: number;
  imported: number;
  results: number;
  failed: number;
  remaining: number;
  items: { source: string; id: string; name: string | null; status: string; results?: number; error?: string }[];
};

const TABS = [
  { key: "todo", label: "I kø" },
  { key: "review", label: "Må vurderes" },
  { key: "imported", label: "Importert" },
  { key: "failed", label: "Feilet / tomme" },
  { key: "ignored", label: "Ignorert" },
  { key: "all", label: "Alle" },
];

function daysAgo(n: number) {
  const d = new Date(Date.now() - n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export default function QueuePanel({ onCountsChange }: { onCountsChange?: (todo: number) => void }) {
  const [tab, setTab] = useState("todo");
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowBusy, setRowBusy] = useState<Set<string>>(new Set());

  const [crawling, setCrawling] = useState<null | "crawl" | "discover" | "process" | "scan">(null);
  const [log, setLog] = useState<string[]>([]);
  const stopRef = useRef(false);

  const [bfFrom, setBfFrom] = useState(daysAgo(365));
  const [bfTo, setBfTo] = useState(daysAgo(0));
  const [bfSources, setBfSources] = useState<string[]>(["eqtiming", "raceresult"]);
  const [showBackfill, setShowBackfill] = useState(false);

  const [scanFrom, setScanFrom] = useState("5000");
  const [scanTo, setScanTo] = useState("");
  const [scanMin, setScanMin] = useState("15");

  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab, page: String(page) });
      if (source) params.set("source", source);
      if (q.trim()) params.set("q", q.trim());
      const d = await api<QueueResponse>(`/api/admin/queue?${params}`);
      setData(d);
      onCountsChange?.(d.counts?.todo ?? 0);
    } catch (e) {
      addLog(`✗ Kunne ikke laste køen: ${e instanceof Error ? e.message : e}`);
    } finally {
      setLoading(false);
    }
  }, [tab, page, source, q, onCountsChange]);

  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(load, q ? 250 : 0);
  }, [load, q]);

  useEffect(() => setSelected(new Set()), [tab, source, q, page]);

  function addLog(line: string) {
    setLog((l) => [`${new Date().toLocaleTimeString("nb-NO")}  ${line}`, ...l].slice(0, 200));
  }

  function describeDiscovery(d: CrawlStats["discovery"]) {
    if (!d) return;
    for (const [src, s] of Object.entries(d)) {
      addLog(
        s.error
          ? `✗ ${sourceLabel(src)}: ${s.error}`
          : `${sourceLabel(src)}: ${s.found} funnet, ${s.added} nye i køen${s.alreadyImported ? ` (${s.alreadyImported} var importert fra før)` : ""}`
      );
    }
  }

  function describeProcessing(p: ProcessResult) {
    for (const it of p.items) {
      const label = `${sourceLabel(it.source)} #${it.id} ${it.name ?? ""}`;
      if (it.status === "imported") addLog(`✓ ${label}: ${fmtNum(it.results)} resultater`);
      else if (it.status === "no_results") addLog(`… ${label}: ingen resultater ennå`);
      else addLog(`✗ ${label}: ${it.error}`);
    }
  }

  async function crawlNow(mode: "crawl" | "discover", backfill = false) {
    setCrawling(mode);
    addLog(backfill ? `Søker etter løp ${bfFrom} → ${bfTo}…` : mode === "crawl" ? "Crawler de siste dagene og importerer…" : "Søker etter nye løp…");
    try {
      const body = backfill ? { mode: "discover", from: bfFrom, to: bfTo, sources: bfSources } : { mode, budgetMs: 50_000 };
      const d = await api<{ ok: boolean; error?: string; discovery?: CrawlStats["discovery"]; processing?: ProcessResult | null }>(
        "/api/admin/crawl",
        { method: "POST", json: body }
      );
      if (!d.ok) throw new Error(d.error);
      describeDiscovery(d.discovery);
      if (d.processing) {
        describeProcessing(d.processing);
        if (d.processing.remaining) addLog(`${d.processing.remaining} løp gjenstår i køen — trykk «Prosesser kø» for å fortsette.`);
      }
    } catch (e) {
      addLog(`✗ ${e instanceof Error ? e.message : e}`);
    } finally {
      setCrawling(null);
      load();
    }
  }

  /** Imports due items in ~50 s chunks until the queue is empty or the user stops. */
  async function processLoop() {
    setCrawling("process");
    stopRef.current = false;
    addLog("Prosesserer køen…");
    try {
      for (let round = 0; round < 500 && !stopRef.current; round++) {
        const d = await api<{ ok: boolean; error?: string; processing: ProcessResult }>("/api/admin/crawl", {
          method: "POST",
          json: { mode: "process", budgetMs: 50_000 },
        });
        if (!d.ok) throw new Error(d.error);
        describeProcessing(d.processing);
        load();
        if (d.processing.processed === 0 || d.processing.remaining === 0) {
          addLog(d.processing.remaining ? `Ferdig for nå (${d.processing.remaining} venter på retry).` : "Køen er tom ✓");
          break;
        }
      }
      if (stopRef.current) addLog("Stoppet.");
    } catch (e) {
      addLog(`✗ ${e instanceof Error ? e.message : e}`);
    } finally {
      setCrawling(null);
      load();
    }
  }

  /** Walks Ultimate event ids in ~45 s chunks, queueing events with many Norwegian finishers. */
  async function scanUltimateLoop() {
    setCrawling("scan");
    stopRef.current = false;
    let fromId = Number(scanFrom);
    let toId = scanTo ? Number(scanTo) : null;
    try {
      if (!toId) {
        const d = await api<{ latestId: number | null }>("/api/admin/crawl", { method: "POST", json: { mode: "ultimate-latest" } });
        toId = d.latestId;
        if (toId) setScanTo(String(toId));
      }
      addLog(`Skanner Ultimate-ID ${fromId}–${toId ?? "?"} etter løp med minst ${scanMin} norske deltakere…`);
      let total = 0;
      for (let round = 0; round < 500 && !stopRef.current; round++) {
        const d = await api<{
          ok: boolean;
          error?: string;
          scan: { scannedTo: number; nextId: number | null; done: boolean; toId: number; found: { id: number; name: string | null; norwegians: number; date: string | null }[]; errors: number };
        }>("/api/admin/crawl", {
          method: "POST",
          json: { mode: "ultimate-scan", fromId, toId, minNorwegians: Number(scanMin) || 15, budgetMs: 45_000 },
        });
        if (!d.ok) throw new Error(d.error);
        const s = d.scan;
        for (const f of s.found) addLog(`＋ #${f.id} ${f.name ?? ""} — ${f.norwegians} nordmenn, ca. ${f.date ?? "ukjent dato"}`);
        total += s.found.length;
        addLog(`Skannet til #${s.scannedTo} av ${s.toId}${s.errors ? ` (${s.errors} feil)` : ""}`);
        setScanFrom(String(s.nextId ?? s.toId));
        if (s.done || !s.nextId) {
          addLog(`Ferdig: ${total} mulige norske løp lagt under «Må vurderes». Sjekk datoene før du godkjenner.`);
          break;
        }
        fromId = s.nextId;
        load();
      }
      if (stopRef.current) addLog(`Stoppet — fortsett fra #${fromId} senere.`);
    } catch (e) {
      addLog(`✗ ${e instanceof Error ? e.message : e}`);
    } finally {
      setCrawling(null);
      load();
    }
  }

  async function setDate(id: string, date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    try {
      await api("/api/admin/queue", { method: "POST", json: { action: "setDate", ids: [id], date } });
      load();
    } catch (e) {
      addLog(`✗ ${e instanceof Error ? e.message : e}`);
    }
  }

  async function act(action: "approve" | "ignore" | "retry", ids: string[]) {
    if (!ids.length) return;
    try {
      await api("/api/admin/queue", { method: "POST", json: { action, ids } });
      setSelected(new Set());
      load();
    } catch (e) {
      addLog(`✗ ${e instanceof Error ? e.message : e}`);
    }
  }

  async function importNow(ids: string[]) {
    for (const id of ids) {
      setRowBusy((s) => new Set(s).add(id));
      try {
        const d = await api<{ results: { name: string | null; status: string; error?: string; message?: string; summary?: { results: number } }[] }>(
          "/api/admin/queue",
          { method: "POST", json: { action: "import", ids: [id] } }
        );
        for (const r of d.results ?? []) {
          if (r.status === "imported") addLog(`✓ ${r.name}: ${fmtNum(r.summary?.results)} resultater`);
          else addLog(`${r.status === "no_results" ? "…" : "✗"} ${r.name}: ${r.error ?? r.message ?? r.status}`);
        }
      } catch (e) {
        addLog(`✗ ${e instanceof Error ? e.message : e}`);
      } finally {
        setRowBusy((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
      }
    }
    setSelected(new Set());
    load();
  }

  const items = data?.items ?? [];
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const last = data?.lastCrawl;

  return (
    <div className="imp-panel">
      <section className="imp-card">
        <div className="imp-card-head">
          <div>
            <h2 className="imp-h2">Automatisk crawler</h2>
            <p className="imp-help" style={{ margin: 0 }}>
              Finner norske løp hos EQ Timing, RaceResult og Ultimate hver natt, og importerer dem når resultatene er publisert.
              Løp importeres på nytt etter noen dager for å få med rettelser.
            </p>
          </div>
        </div>

        <div className="imp-stats">
          <div className="imp-stat">
            <span className="imp-stat-label">Siste kjøring</span>
            <span className="imp-stat-value">
              {last ? (
                <>
                  {fmtDateTime(last.started_at)} <StatusBadge status={last.status} title={last.error ?? undefined} />
                </>
              ) : (
                "aldri"
              )}
            </span>
            {last?.stats?.processing && (
              <span className="imp-stat-sub">
                {last.trigger} · {last.stats.processing.imported} importert · {fmtNum(last.stats.processing.results)} resultater
              </span>
            )}
          </div>
          <div className="imp-stat">
            <span className="imp-stat-label">Klare for import</span>
            <span className="imp-stat-value">{fmtNum(data?.due)}</span>
          </div>
          <div className="imp-stat">
            <span className="imp-stat-label">Må vurderes</span>
            <span className="imp-stat-value">{fmtNum(data?.counts?.review)}</span>
          </div>
          <div className="imp-stat">
            <span className="imp-stat-label">Importert via køen</span>
            <span className="imp-stat-value">{fmtNum(data?.counts?.imported)}</span>
          </div>
        </div>

        <div className="imp-actions">
          <button className="adm-btn adm-btn--primary" onClick={() => crawlNow("crawl")} disabled={!!crawling}>
            {crawling === "crawl" && <Spinner />} Crawl nå
          </button>
          <button className="adm-btn adm-btn--ghost" onClick={() => crawlNow("discover")} disabled={!!crawling}>
            {crawling === "discover" && <Spinner />} Bare finn nye løp
          </button>
          {crawling === "process" ? (
            <button className="adm-btn adm-btn--danger" onClick={() => (stopRef.current = true)}>
              <Spinner /> Stopp
            </button>
          ) : (
            <button className="adm-btn adm-btn--ghost" onClick={processLoop} disabled={!!crawling || !data?.due}>
              Prosesser kø ({fmtNum(data?.due)})
            </button>
          )}
          <button className="adm-btn adm-btn--ghost" onClick={() => setShowBackfill((v) => !v)}>
            {showBackfill ? "Skjul" : "Hent historikk…"}
          </button>
        </div>

        {showBackfill && (
          <div className="imp-overrides">
            <p className="adm-field-hint" style={{ marginTop: 0 }}>
              Finner alle norske løp i perioden og legger dem i køen (løp som allerede er importert hoppes over). Ultimate har
              ingen historikk her — bruk Ultimate-skanneren under.
            </p>
            <div className="imp-row">
              <div className="adm-field">
                <label className="adm-label">Fra</label>
                <input type="date" className="adm-input" value={bfFrom} onChange={(e) => setBfFrom(e.target.value)} />
              </div>
              <div className="adm-field">
                <label className="adm-label">Til</label>
                <input type="date" className="adm-input" value={bfTo} onChange={(e) => setBfTo(e.target.value)} />
              </div>
              <div className="adm-field">
                <label className="adm-label">Kilder</label>
                <div className="imp-row" style={{ gap: 12, marginTop: 6 }}>
                  {SOURCES.filter((s) => s.slug !== "ultimate" && s.slug !== "racedays").map((s) => (
                    <label key={s.slug} className="imp-check" style={{ margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={bfSources.includes(s.slug)}
                        onChange={(e) =>
                          setBfSources((cur) => (e.target.checked ? [...cur, s.slug] : cur.filter((x) => x !== s.slug)))
                        }
                      />
                      {s.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="adm-field" style={{ justifyContent: "flex-end" }}>
                <button
                  className="adm-btn adm-btn--primary"
                  onClick={() => crawlNow("discover", true)}
                  disabled={!!crawling || !bfSources.length}
                >
                  {crawling === "discover" && <Spinner />} Finn løp i perioden
                </button>
              </div>
            </div>

            <h3 className="imp-h2" style={{ marginTop: 18 }}>
              Ultimate-skanner
            </h3>
            <p className="adm-field-hint" style={{ marginTop: 0 }}>
              Ultimate har ingen arkiv eller datoer, men event-ID-ene er fortløpende. Skanneren sjekker hvert ID for antall
              norske deltakere og legger treff under «Må vurderes» med en <strong>anslått dato</strong> (fra tittelen eller
              ID-ene til løp du allerede har). Sjekk datoen og godkjenn. Ca. 10–20 min for 3000 ID-er — du kan stoppe og
              fortsette senere.
            </p>
            <div className="imp-row">
              <div className="adm-field" style={{ width: 120 }}>
                <label className="adm-label">Fra ID</label>
                <input className="adm-input adm-input--mono" inputMode="numeric" value={scanFrom} onChange={(e) => setScanFrom(e.target.value)} />
              </div>
              <div className="adm-field" style={{ width: 120 }}>
                <label className="adm-label">Til ID</label>
                <input
                  className="adm-input adm-input--mono"
                  inputMode="numeric"
                  placeholder="nyeste"
                  value={scanTo}
                  onChange={(e) => setScanTo(e.target.value)}
                />
              </div>
              <div className="adm-field" style={{ width: 160 }}>
                <label className="adm-label">Min. antall nordmenn</label>
                <input className="adm-input adm-input--mono" inputMode="numeric" value={scanMin} onChange={(e) => setScanMin(e.target.value)} />
              </div>
              <div className="adm-field" style={{ justifyContent: "flex-end" }}>
                {crawling === "scan" ? (
                  <button className="adm-btn adm-btn--danger" onClick={() => (stopRef.current = true)}>
                    <Spinner /> Stopp skanning
                  </button>
                ) : (
                  <button className="adm-btn adm-btn--primary" onClick={scanUltimateLoop} disabled={!!crawling || !/^\d+$/.test(scanFrom)}>
                    Skann Ultimate
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {log.length > 0 && (
          <div className="imp-log">
            {log.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        )}
      </section>

      <section className="imp-card imp-card--flush">
        <div className="adm-toolbar">
          <div className="imp-subtabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`imp-subtab${tab === t.key ? " act" : ""}`}
                onClick={() => {
                  setTab(t.key);
                  setPage(1);
                }}
              >
                {t.label}
                <span className="imp-subtab-count">{fmtNum(data?.counts?.[t.key])}</span>
              </button>
            ))}
          </div>
          <div className="adm-search-wrap" style={{ maxWidth: 280 }}>
            <input
              className="adm-search"
              placeholder="Søk navn, ID, sted…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select className="adm-select" style={{ width: 150 }} value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }}>
            <option value="">Alle kilder</option>
            {SOURCES.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.label}
              </option>
            ))}
          </select>
          {selected.size > 0 && (
            <div className="adm-bulk">
              <span className="adm-bulk-count">{selected.size} valgt</span>
              <button className="adm-btn adm-btn--primary" onClick={() => importNow([...selected])}>
                Importer nå
              </button>
              <button className="adm-btn adm-btn--ghost" onClick={() => act("approve", [...selected])}>
                Godkjenn
              </button>
              <button className="adm-btn adm-btn--ghost" onClick={() => act("retry", [...selected])}>
                Prøv igjen
              </button>
              <button className="adm-btn adm-btn--ghost" onClick={() => act("ignore", [...selected])}>
                Ignorer
              </button>
            </div>
          )}
        </div>

        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)))}
                  />
                </th>
                <th>Dato</th>
                <th>Løp</th>
                <th>Kilde</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Resultater</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && !data && (
                <tr>
                  <td colSpan={7} className="adm-loading">
                    Laster…
                  </td>
                </tr>
              )}
              {data && items.length === 0 && (
                <tr>
                  <td colSpan={7} className="adm-empty">
                    {tab === "todo" ? "Ingenting i kø — trykk «Crawl nå» for å se etter nye løp" : "Ingen løp her"}
                  </td>
                </tr>
              )}
              {items.map((it) => (
                <tr key={it.id} className={`adm-tr${selected.has(it.id) ? " sel" : ""}`}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(it.id)}
                      onChange={() => {
                        const s = new Set(selected);
                        if (s.has(it.id)) s.delete(it.id);
                        else s.add(it.id);
                        setSelected(s);
                      }}
                    />
                  </td>
                  <td className="adm-td-mono">
                    {it.meta?.dateEstimated ? (
                      <>
                        <input
                          type="date"
                          className="adm-input imp-date-input"
                          defaultValue={it.event_date ?? ""}
                          title="Anslått dato — endre for å bekrefte"
                          onBlur={(e) => e.target.value && e.target.value !== it.event_date && setDate(it.id, e.target.value)}
                        />
                        <span className="imp-sub imp-maybe" title={it.meta.dateSource}>
                          anslått
                          {it.event_date && (
                            <button className="imp-linkbtn" onClick={() => setDate(it.id, it.event_date!)}>
                              bekreft
                            </button>
                          )}
                        </span>
                      </>
                    ) : (
                      (it.event_date ?? "—")
                    )}
                  </td>
                  <td className="adm-td-name">
                    <span className="adm-name">{it.name ?? "(uten navn)"}</span>
                    <span className="adm-source-id">
                      {[it.location, it.sport].filter(Boolean).join(" · ")}
                      {it.meta?.norwegians ? (
                        <span className="imp-maybe"> {it.meta.norwegians} nordmenn — sjekk om løpet er norsk</span>
                      ) : (
                        it.relevance === "maybe" && <span className="imp-maybe"> usikker om løping</span>
                      )}
                    </span>
                  </td>
                  <td className="adm-td-mono">
                    {it.url ? (
                      <a className="adm-link" href={it.url} target="_blank" rel="noreferrer">
                        {sourceLabel(it.source_slug)} #{it.source_event_id} ↗
                      </a>
                    ) : (
                      `${sourceLabel(it.source_slug)} #${it.source_event_id}`
                    )}
                  </td>
                  <td>
                    <StatusBadge status={it.status} title={it.last_error ?? undefined} />
                    {it.meta?.preexisting && <span className="imp-sub">fra før</span>}
                    {it.status === "waiting" && <span className="imp-sub">neste forsøk {fmtDateTime(it.next_attempt_at)}</span>}
                    {it.status === "pending" && it.attempts > 0 && <span className="imp-sub">{it.attempts} feil</span>}
                    {it.refresh_at && it.status === "imported" && <span className="imp-sub">oppdateres {fmtDateTime(it.refresh_at)}</span>}
                    {it.last_error && (it.status === "failed" || it.status === "no_results" || it.attempts > 0) && (
                      <span className="imp-err" title={it.last_error}>
                        {it.last_error.slice(0, 90)}
                      </span>
                    )}
                  </td>
                  <td className="adm-td-num">{fmtNum(it.result_count)}</td>
                  <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                    {rowBusy.has(it.id) ? (
                      <Spinner />
                    ) : (
                      <>
                        <button className="adm-row-btn" onClick={() => importNow([it.id])} title="Importer nå">
                          {it.status === "imported" ? "Reimporter" : "Importer"}
                        </button>
                        {it.status !== "ignored" && it.status !== "imported" && (
                          <button className="adm-row-btn" onClick={() => act("ignore", [it.id])}>
                            Ignorer
                          </button>
                        )}
                        {(it.status === "ignored" || (it.relevance === "maybe" && it.approved === null)) && (
                          <button className="adm-row-btn" onClick={() => act("approve", [it.id])}>
                            Godkjenn
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data && data.pages > 1 && (
          <div className="adm-pagination">
            <button className="adm-page-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ←
            </button>
            <span className="adm-page-info">
              Side {page} av {data.pages} · {fmtNum(data.total)} løp
            </span>
            <button className="adm-page-btn" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
              →
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
