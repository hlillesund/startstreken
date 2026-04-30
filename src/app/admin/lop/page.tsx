"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface SeriesSummary {
  id: string;
  name: string;
  slug: string;
  location: string | null;
  edition_count: number;
}

interface EventRow {
  id: string;
  name: string;
  source_event_id: string;
  start_date: string | null;
  location: string | null;
  series: { id: string; name: string; slug: string } | null;
  race_count: number;
  result_count: number;
  distances: string[];
}

interface RaceDetail {
  id: string;
  name: string;
  distance_category_override: string | null;
  inferred_distances: string[];
  result_count: number;
}

interface EventDetail {
  id: string;
  name: string;
  source_event_id: string;
  start_date: string | null;
  location: string | null;
  pretty_url: string | null;
  series: SeriesSummary | null;
  races: RaceDetail[];
}

interface SeriesEdition {
  id: string;
  name: string;
  start_date: string | null;
  location: string | null;
  race_count: number;
  result_count: number;
  distances: string[];
}

interface SeriesDetail {
  id: string;
  name: string;
  slug: string;
  location: string | null;
  notes: string | null;
  editions: SeriesEdition[];
}

const DIST_COLORS: Record<string, string> = {
  "5K":   "#e0f2fe",
  "10K":  "#dcfce7",
  "HM":   "#fef9c3",
  "M":    "#fee2e2",
  "OTHER":"#f3f4f6",
};
const DIST_TEXT: Record<string, string> = {
  "5K":   "#0369a1",
  "10K":  "#166534",
  "HM":   "#854d0e",
  "M":    "#991b1b",
  "OTHER":"#6b7280",
};

function DistBadge({ dist }: { dist: string }) {
  const bg   = DIST_COLORS[dist] ?? DIST_COLORS.OTHER;
  const text = DIST_TEXT[dist]   ?? DIST_TEXT.OTHER;
  return (
    <span style={{
      display: "inline-block", padding: "1px 7px", borderRadius: 3,
      fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
      textTransform: "uppercase", background: bg, color: text,
      fontFamily: "var(--font-mono)", marginRight: 4, marginBottom: 2,
    }}>
      {dist}
    </span>
  );
}

function toast(msg: string, type: "ok" | "err" = "ok") {
  const el = document.createElement("div");
  el.textContent = msg;
  Object.assign(el.style, {
    position: "fixed", bottom: "24px", right: "24px", zIndex: 9999,
    background: type === "ok" ? "#1a1a1a" : "#dc2626",
    color: "#fff", padding: "10px 18px",
    fontFamily: "var(--font-mono)", fontSize: "12px",
    letterSpacing: "0.06em", boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
    transition: "opacity 0.3s",
  });
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 400); }, 2400);
}

/* ─── Main Component ─────────────────────────────────────────────────────── */
export default function AdminLopPage() {
  // Panel state
  const [view, setView]                 = useState<"events" | "series">("events");

  // Events panel
  const [evQ, setEvQ]                   = useState("");
  const [evPage, setEvPage]             = useState(1);
  const [evRows, setEvRows]             = useState<EventRow[]>([]);
  const [evTotal, setEvTotal]           = useState(0);
  const [evPages, setEvPages]           = useState(1);
  const [evLoading, setEvLoading]       = useState(false);
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [editEvent, setEditEvent]       = useState<EventDetail | null>(null);
  const [editLoading, setEditLoading]   = useState(false);

  // Series panel
  const [serQ, setSerQ]                 = useState("");
  const [serRows, setSerRows]           = useState<SeriesSummary[]>([]);
  const [serLoading, setSerLoading]     = useState(false);
  const [editSeries, setEditSeries]     = useState<SeriesDetail | null>(null);
  const [serDetailLoading, setSerDetailLoading] = useState(false);
  const [newSeriesName, setNewSeriesName] = useState("");
  const [showNewSeries, setShowNewSeries] = useState(false);

  // Assign-series modal
  const [showAssign, setShowAssign]     = useState(false);
  const [assignSeries, setAssignSeries] = useState<SeriesSummary | null>(null);
  const [assignQ, setAssignQ]           = useState("");
  const [assignResults, setAssignResults] = useState<SeriesSummary[]>([]);

  const evDebounce = useRef<NodeJS.Timeout | undefined>(undefined);
  const serDebounce = useRef<NodeJS.Timeout | undefined>(undefined);
  const assignDebounce = useRef<NodeJS.Timeout | undefined>(undefined);

  /* ── Fetch events ── */
  const loadEvents = useCallback((q: string, page: number) => {
    setEvLoading(true);
    fetch(`/api/admin/events?q=${encodeURIComponent(q)}&page=${page}`)
      .then((r) => r.json())
      .then((d) => { setEvRows(d.events ?? []); setEvTotal(d.total ?? 0); setEvPages(d.pages ?? 1); })
      .finally(() => setEvLoading(false));
  }, []);

  useEffect(() => {
    clearTimeout(evDebounce.current);
    evDebounce.current = setTimeout(() => loadEvents(evQ, evPage), 280);
  }, [evQ, evPage, loadEvents]);

  /* ── Fetch series list ── */
  const loadSeries = useCallback((q: string) => {
    setSerLoading(true);
    fetch(`/api/admin/series?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((d) => setSerRows(Array.isArray(d) ? d : []))
      .finally(() => setSerLoading(false));
  }, []);

  useEffect(() => {
    clearTimeout(serDebounce.current);
    serDebounce.current = setTimeout(() => loadSeries(serQ), 280);
  }, [serQ, loadSeries]);

  /* ── Assign search ── */
  useEffect(() => {
    if (!showAssign) return;
    clearTimeout(assignDebounce.current);
    assignDebounce.current = setTimeout(() => {
      fetch(`/api/admin/series?q=${encodeURIComponent(assignQ)}`)
        .then((r) => r.json())
        .then((d) => setAssignResults(Array.isArray(d) ? d : []));
    }, 240);
  }, [assignQ, showAssign]);

  /* ── Open event detail ── */
  async function openEvent(id: string) {
    setEditLoading(true);
    const d = await fetch(`/api/admin/events/${id}`).then((r) => r.json());
    setEditLoading(false);
    if (d.ok) setEditEvent(d.event);
    else toast("Kunne ikke laste event", "err");
  }

  /* ── Save event ── */
  async function saveEvent(ev: EventDetail, patch: Partial<EventDetail>) {
    const res = await fetch(`/api/admin/events/${ev.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then((r) => r.json());
    if (res.ok) {
      toast("Lagret ✓");
      setEditEvent(null);
      loadEvents(evQ, evPage);
    } else toast("Feil ved lagring", "err");
  }

  /* ── Save race override ── */
  async function saveRace(raceId: string, patch: object) {
    const res = await fetch(`/api/admin/races/${raceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then((r) => r.json());
    if (res.ok) toast("Race lagret ✓");
    else toast("Feil", "err");
  }

  /* ── Assign selected events to a series ── */
  async function assignToSeries(seriesId: string | null) {
    const ids = [...selected];
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/admin/events/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ series_id: seriesId }),
        })
      )
    );
    toast(`${ids.length} event${ids.length !== 1 ? "s" : ""} oppdatert ✓`);
    setSelected(new Set());
    setShowAssign(false);
    setAssignSeries(null);
    loadEvents(evQ, evPage);
  }

  /* ── Open series detail ── */
  async function openSeries(id: string) {
    setSerDetailLoading(true);
    const d = await fetch(`/api/admin/series/${id}`).then((r) => r.json());
    setSerDetailLoading(false);
    if (d.ok) setEditSeries(d.series);
    else toast("Kunne ikke laste serie", "err");
  }

  /* ── Create new series ── */
 async function createSeries() {
  if (!newSeriesName.trim()) return;

  const res = await fetch("/api/admin/series", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: newSeriesName.trim() }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.ok) {
    console.error("Create series failed:", data);
    toast(data?.error ?? "Feil ved opprettelse", "err");
    return;
  }

  toast("Serie opprettet ✓");
  setNewSeriesName("");
  setShowNewSeries(false);
  loadSeries(serQ);
}

  /* ── Delete series ── */
  async function deleteSeries(id: string) {
    if (!confirm("Slett serie? Events kobles fra, men slettes ikke.")) return;
    const res = await fetch(`/api/admin/series/${id}`, { method: "DELETE" }).then((r) => r.json());
    if (res.ok) { toast("Serie slettet"); setEditSeries(null); loadSeries(serQ); }
    else toast("Feil ved sletting", "err");
  }

  const allSelected = evRows.length > 0 && evRows.every((r) => selected.has(r.id));

  return (
    <div className="adm-root">
      {/* ── TOPBAR ── */}
      <div className="adm-topbar">
        <div className="adm-topbar-left">
          <span className="adm-logo">Admin</span>
          <span className="adm-logo-sep">/</span>
          <span className="adm-logo-page">Løp &amp; Serier</span>
        </div>
        <div className="adm-tabs">
          <button
            className={`adm-tab${view === "events" ? " act" : ""}`}
            onClick={() => setView("events")}
          >
            Events
            {evTotal > 0 && <span className="adm-tab-count">{evTotal}</span>}
          </button>
          <button
            className={`adm-tab${view === "series" ? " act" : ""}`}
            onClick={() => setView("series")}
          >
            Serier
            {serRows.length > 0 && <span className="adm-tab-count">{serRows.length}</span>}
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════
          EVENTS VIEW
      ════════════════════════════════════ */}
      {view === "events" && (
        <div className="adm-body">
          {/* search + bulk actions */}
          <div className="adm-toolbar">
            <div className="adm-search-wrap">
              <svg className="adm-search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="5.5" cy="5.5" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8.5 8.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <input
                className="adm-search"
                placeholder="Søk på navn, ID eller by…"
                value={evQ}
                onChange={(e) => { setEvQ(e.target.value); setEvPage(1); }}
              />
              {evQ && <button className="adm-search-clear" onClick={() => { setEvQ(""); setEvPage(1); }}>✕</button>}
            </div>

            {selected.size > 0 && (
              <div className="adm-bulk">
                <span className="adm-bulk-count">{selected.size} valgt</span>
                <button className="adm-btn adm-btn--primary" onClick={() => setShowAssign(true)}>
                  Koble til serie
                </button>
                <button className="adm-btn adm-btn--ghost" onClick={() => assignToSeries(null)}>
                  Fjern serie
                </button>
                <button className="adm-btn adm-btn--ghost" onClick={() => setSelected(new Set())}>
                  Avbryt
                </button>
              </div>
            )}
          </div>

          {/* table */}
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(evRows.map((r) => r.id)))}
                    />
                  </th>
                  <th>Navn</th>
                  <th>Dato</th>
                  <th>By</th>
                  <th>Distanser</th>
                  <th>Løp</th>
                  <th>Resultater</th>
                  <th>Serie</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {evLoading && (
                  <tr><td colSpan={9} className="adm-loading">Laster…</td></tr>
                )}
                {!evLoading && evRows.length === 0 && (
                  <tr><td colSpan={9} className="adm-empty">Ingen events funnet</td></tr>
                )}
                {!evLoading && evRows.map((ev) => (
                  <tr
                    key={ev.id}
                    className={`adm-tr${selected.has(ev.id) ? " sel" : ""}`}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(ev.id)}
                        onChange={() => {
                          const s = new Set(selected);
                          s.has(ev.id) ? s.delete(ev.id) : s.add(ev.id);
                          setSelected(s);
                        }}
                      />
                    </td>
                    <td className="adm-td-name">
                      <span className="adm-name">{ev.name}</span>
                      <span className="adm-source-id">{ev.source_event_id}</span>
                    </td>
                    <td className="adm-td-mono">{ev.start_date ?? "—"}</td>
                    <td className="adm-td-mono">{ev.location ?? "—"}</td>
                    <td>
                      {ev.distances.length === 0
                        ? <span className="adm-warn">Ingen</span>
                        : ev.distances.map((d) => <DistBadge key={d} dist={d} />)
                      }
                    </td>
                    <td className="adm-td-num">{ev.race_count}</td>
                    <td className="adm-td-num">{ev.result_count.toLocaleString("nb-NO")}</td>
                    <td>
                      {ev.series
                        ? <span className="adm-series-tag" onClick={() => openSeries(ev.series!.id)}>{ev.series.name}</span>
                        : <span className="adm-warn">Ingen serie</span>
                      }
                    </td>
                    <td>
                      <button className="adm-row-btn" onClick={() => openEvent(ev.id)}>
                        Rediger →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* pagination */}
          {evPages > 1 && (
            <div className="adm-pagination">
              <button className="adm-page-btn" disabled={evPage === 1} onClick={() => setEvPage(evPage - 1)}>← Forrige</button>
              <span className="adm-page-info">Side {evPage} av {evPages} · {evTotal} totalt</span>
              <button className="adm-page-btn" disabled={evPage === evPages} onClick={() => setEvPage(evPage + 1)}>Neste →</button>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════
          SERIES VIEW
      ════════════════════════════════════ */}
      {view === "series" && (
        <div className="adm-body">
          <div className="adm-toolbar">
            <div className="adm-search-wrap">
              <svg className="adm-search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="5.5" cy="5.5" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8.5 8.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <input
                className="adm-search"
                placeholder="Søk serienavn…"
                value={serQ}
                onChange={(e) => setSerQ(e.target.value)}
              />
            </div>
            <button className="adm-btn adm-btn--primary" onClick={() => setShowNewSeries(true)}>
              + Ny serie
            </button>
          </div>

          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Serienavn</th>
                  <th>Slug</th>
                  <th>By</th>
                  <th>Utgaver</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {serLoading && <tr><td colSpan={5} className="adm-loading">Laster…</td></tr>}
                {!serLoading && serRows.length === 0 && (
                  <tr><td colSpan={5} className="adm-empty">Ingen serier funnet</td></tr>
                )}
                {!serLoading && serRows.map((s) => (
                  <tr key={s.id} className="adm-tr">
                    <td className="adm-td-name"><span className="adm-name">{s.name}</span></td>
                    <td className="adm-td-mono adm-slug">{s.slug}</td>
                    <td className="adm-td-mono">{s.location ?? "—"}</td>
                    <td className="adm-td-num">
                      <span className={`adm-edition-count${s.edition_count === 0 ? " zero" : ""}`}>
                        {s.edition_count}
                      </span>
                    </td>
                    <td>
                      <button className="adm-row-btn" onClick={() => openSeries(s.id)}>
                        Se utgaver →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════
          EDIT EVENT DRAWER
      ════════════════════════════════════ */}
      {editEvent && (
        <EventDrawer
          event={editEvent}
          onClose={() => setEditEvent(null)}
          onSave={(patch) => saveEvent(editEvent, patch)}
          onSaveRace={saveRace}
          onOpenSeries={openSeries}
        />
      )}

      {/* ════════════════════════════════════
          SERIES DETAIL DRAWER
      ════════════════════════════════════ */}
      {editSeries && (
        <SeriesDrawer
          series={editSeries}
          onClose={() => setEditSeries(null)}
          onSave={async (patch) => {
            const res = await fetch(`/api/admin/series/${editSeries.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(patch),
            }).then((r) => r.json());
            if (res.ok) { toast("Lagret ✓"); setEditSeries(null); loadSeries(serQ); }
            else toast("Feil", "err");
          }}
          onDelete={() => deleteSeries(editSeries.id)}
          onOpenEvent={openEvent}
        />
      )}

      {/* ════════════════════════════════════
          ASSIGN SERIES MODAL
      ════════════════════════════════════ */}
      {showAssign && (
        <div className="adm-modal-backdrop" onClick={() => setShowAssign(false)}>
          <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-head">
              <span>Koble {selected.size} event{selected.size !== 1 ? "s" : ""} til serie</span>
              <button className="adm-modal-close" onClick={() => setShowAssign(false)}>✕</button>
            </div>
            <div className="adm-modal-body">
              <div className="adm-search-wrap" style={{ marginBottom: 12 }}>
                <svg className="adm-search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="5.5" cy="5.5" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M8.5 8.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <input
                  className="adm-search"
                  placeholder="Søk serienavn…"
                  value={assignQ}
                  onChange={(e) => setAssignQ(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="adm-assign-list">
                {assignResults.map((s) => (
                  <div
                    key={s.id}
                    className={`adm-assign-row${assignSeries?.id === s.id ? " sel" : ""}`}
                    onClick={() => setAssignSeries(s)}
                  >
                    <div className="adm-assign-name">{s.name}</div>
                    <div className="adm-assign-meta">{s.edition_count} utgaver</div>
                  </div>
                ))}
                {assignResults.length === 0 && (
                  <div className="adm-empty" style={{ padding: "20px 0" }}>Ingen serier. Opprett en under Serier-fanen.</div>
                )}
              </div>
            </div>
            <div className="adm-modal-foot">
              <button
                className="adm-btn adm-btn--primary"
                disabled={!assignSeries}
                onClick={() => assignSeries && assignToSeries(assignSeries.id)}
              >
                Koble til{assignSeries ? ` "${assignSeries.name}"` : ""}
              </button>
              <button className="adm-btn adm-btn--ghost" onClick={() => setShowAssign(false)}>Avbryt</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════
          NEW SERIES MODAL
      ════════════════════════════════════ */}
      {showNewSeries && (
        <div className="adm-modal-backdrop" onClick={() => setShowNewSeries(false)}>
          <div className="adm-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-head">
              <span>Ny serie</span>
              <button className="adm-modal-close" onClick={() => setShowNewSeries(false)}>✕</button>
            </div>
            <div className="adm-modal-body">
              <label className="adm-label">Serienavn</label>
              <input
                className="adm-input"
                placeholder="f.eks. Bergen City Marathon"
                value={newSeriesName}
                onChange={(e) => setNewSeriesName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createSeries()}
                autoFocus
              />
            </div>
            <div className="adm-modal-foot">
              <button className="adm-btn adm-btn--primary" onClick={createSeries}>Opprett</button>
              <button className="adm-btn adm-btn--ghost" onClick={() => setShowNewSeries(false)}>Avbryt</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Event Drawer ───────────────────────────────────────────────────────── */
function EventDrawer({
  event, onClose, onSave, onSaveRace, onOpenSeries,
}: {
  event: EventDetail;
  onClose: () => void;
  onSave: (patch: object) => void;
  onSaveRace: (id: string, patch: object) => void;
  onOpenSeries: (id: string) => void;
}) {
  const [name, setName]           = useState(event.name);
  const [date, setDate]           = useState(event.start_date ?? "");
  const [location, setLocation]   = useState(event.location ?? "");
  const [dirty, setDirty]         = useState(false);
  const [races, setRaces]         = useState(event.races);

  // Reimport state
  const [showReimport, setShowReimport] = useState(false);
  const [importSource, setImportSource] = useState<"eqtiming" | "ultimate" | "raceresult">("eqtiming");
  const [eqEventId, setEqEventId]       = useState(event.source_event_id ?? "");
  const [eqReportId, setEqReportId]     = useState(""); // used as: ultimate distance, rr key
  const [rrExtra, setRrExtra]           = useState({ listName: "Online|Final", contest: "0", filter: "" });
  const [importing, setImporting]       = useState(false);
  const [importResult, setImportResult] = useState<{
    ok: boolean;
    message?: string;
    error?: string;
    inserted?: number;
    skipped?: number;
    summary?: unknown;
  } | null>(null);

  function mark<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setDirty(true); };
  }

  function handleSave() {
    onSave({
      name: name.trim(),
      start_date: date || null,
      location: location.trim() || null,
    });
  }

  async function updateRaceOverride(raceId: string, val: string | null) {
    await onSaveRace(raceId, { distance_category_override: val || null });
    setRaces((prev) => prev.map((r) => r.id === raceId ? { ...r, distance_category_override: val || null } : r));
  }

  async function runReimport() {
    if (!eqEventId.trim()) {
      setImportResult({ ok: false, error: "Event ID er påkrevd." });
      return;
    }
    setImporting(true);
    setImportResult(null);

    const payload: Record<string, unknown> = {
      sourceSlug: importSource,
    };

    if (importSource === "eqtiming") {
      payload.eq_eventId = eqEventId.trim();
    } else if (importSource === "ultimate") {
      payload.ult_eventId  = eqEventId.trim();
      payload.ult_distance = eqReportId.trim() || undefined;
      payload.ult_mode     = "NOR";
    } else if (importSource === "raceresult") {
      payload.rr_eventId  = eqEventId.trim();
      payload.rr_key      = eqReportId.trim();
      payload.rr_listName = rrExtra.listName;
      payload.rr_contest  = rrExtra.contest;
      payload.rr_filter   = rrExtra.filter;
    }

    try {
      const res = await fetch(`/api/admin/events/${event.id}/reimport`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json());
      setImportResult(res);
      if (res.ok) toast("Import OK ✓");
      else toast(res.error ?? "Import feilet", "err");
    } catch {
      setImportResult({ ok: false, error: "Nettverksfeil" });
      toast("Nettverksfeil", "err");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="adm-drawer-backdrop" onClick={onClose}>
      <div className="adm-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="adm-drawer-head">
          <span className="adm-drawer-title">Rediger Event</span>
          <button className="adm-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="adm-drawer-body">

          {/* ── Source ID ── */}
          <div className="adm-field">
            <label className="adm-label">Kilde-ID (eqtiming event ID)</label>
            <div className="adm-readonly">{event.source_event_id}</div>
          </div>

          {/* ── Name ── */}
          <div className="adm-field">
            <label className="adm-label">Navn</label>
            <input className="adm-input" value={name} onChange={(e) => mark(setName)(e.target.value)} />
          </div>

          {/* ── Date + Location ── */}
          <div className="adm-field-row">
            <div className="adm-field">
              <label className="adm-label">Dato</label>
              <input type="date" className="adm-input" value={date} onChange={(e) => mark(setDate)(e.target.value)} />
            </div>
            <div className="adm-field">
              <label className="adm-label">By / Sted</label>
              <input className="adm-input" value={location} onChange={(e) => mark(setLocation)(e.target.value)} />
            </div>
          </div>

          {/* ── Series ── */}
          <div className="adm-field">
            <label className="adm-label">Serie</label>
            {event.series
              ? (
                <div className="adm-series-linked">
                  <span className="adm-series-tag" onClick={() => onOpenSeries(event.series!.id)}>
                    {event.series.name}
                  </span>
                  <span className="adm-series-slug">{event.series.slug}</span>
                </div>
              )
              : <div className="adm-warn">Ikke koblet til noen serie. Velg eventet i listen og bruk "Koble til serie".</div>
            }
          </div>

          {/* ── Races ── */}
          <div className="adm-field">
            <label className="adm-label">Løp / distanser under dette eventet</label>
            <div className="adm-race-list">
              {races.map((r) => (
                <div key={r.id} className="adm-race-row">
                  <div className="adm-race-info">
                    <span className="adm-race-name">{r.name}</span>
                    <span className="adm-race-count">{r.result_count.toLocaleString("nb-NO")} resultater</span>
                    <div className="adm-race-dists">
                      {r.inferred_distances.map((d) => <DistBadge key={d} dist={d} />)}
                      {r.inferred_distances.length === 0 && <span className="adm-warn">Ingen distanse</span>}
                    </div>
                  </div>
                  <div className="adm-race-override">
                    <label className="adm-label" style={{ marginBottom: 4 }}>Override distanse</label>
                    <select
                      className="adm-select"
                      value={r.distance_category_override ?? ""}
                      onChange={(e) => updateRaceOverride(r.id, e.target.value)}
                    >
                      <option value="">— ingen override —</option>
                      <option value="5K">5K</option>
                      <option value="10K">10K</option>
                      <option value="HM">HM</option>
                      <option value="M">Maraton</option>
                      <option value="OTHER">Annet</option>
                    </select>
                  </div>
                </div>
              ))}
              {races.length === 0 && <div className="adm-empty">Ingen løp under dette eventet ennå.</div>}
            </div>
          </div>

          {/* ── Reimport section ── */}
          <div className="adm-field">
            <div className="adm-reimport-header">
              <label className="adm-label" style={{ marginBottom: 0 }}>Reimporter resultater</label>
              <button
                className="adm-btn adm-btn--ghost"
                style={{ fontSize: 10, padding: "4px 10px" }}
                onClick={() => { setShowReimport(!showReimport); setImportResult(null); }}
              >
                {showReimport ? "Skjul" : "Vis"}
              </button>
            </div>

            {showReimport && (
              <div className="adm-reimport-box">
                <p className="adm-reimport-help">
                  Reimporter fra tidtakingssystem. Eksisterende resultater for dette eventet
                  slettes og erstattes med nye.
                </p>

                {/* Source selector */}
                <div className="adm-field" style={{ marginTop: 12 }}>
                  <label className="adm-label">Kilde</label>
                  <div className="adm-source-pills">
                    {(["eqtiming", "ultimate", "raceresult"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`adm-source-pill${(body: any) => body}${eqEventId !== undefined && s === "eqtiming" ? "" : ""}`}
                        style={{
                          padding: "6px 14px",
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          border: "1px solid",
                          cursor: "pointer",
                          transition: "all 0.12s",
                          background: importSource === s ? "#1a1a1a" : "#fff",
                          color: importSource === s ? "var(--highlight)" : "var(--fg-3)",
                          borderColor: importSource === s ? "#1a1a1a" : "var(--line-mid)",
                        }}
                        onClick={() => { setImportSource(s); setImportResult(null); }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* eqtiming fields */}
                {importSource === "eqtiming" && (
                  <div className="adm-field" style={{ marginTop: 12 }}>
                    <label className="adm-label">eqtiming Event ID</label>
                    <input
                      className="adm-input adm-input--mono"
                      placeholder="f.eks. 80410"
                      value={eqEventId}
                      onChange={(e) => setEqEventId(e.target.value)}
                    />
                    <span className="adm-field-hint">
                      Forhåndsutfylt fra kilde-ID: <strong>{event.source_event_id}</strong>.
                      Endre kun hvis du vil reimportere fra et annet event.
                    </span>
                  </div>
                )}

                {/* ultimate fields */}
                {importSource === "ultimate" && (
                  <div className="adm-field-row" style={{ marginTop: 12 }}>
                    <div className="adm-field">
                      <label className="adm-label">Ultimate Event ID</label>
                      <input
                        className="adm-input adm-input--mono"
                        placeholder="f.eks. 6581"
                        value={eqEventId}
                        onChange={(e) => setEqEventId(e.target.value)}
                      />
                    </div>
                    <div className="adm-field">
                      <label className="adm-label">Distance (valgfritt)</label>
                      <input
                        className="adm-input adm-input--mono"
                        placeholder="f.eks. 1 eller 2"
                        value={eqReportId}
                        onChange={(e) => setEqReportId(e.target.value)}
                      />
                      <span className="adm-field-hint">Maraton=1, halvmaraton=2 (varierer per event)</span>
                    </div>
                  </div>
                )}

                {/* raceresult fields */}
                {importSource === "raceresult" && (
                  <>
                    <div className="adm-field-row" style={{ marginTop: 12 }}>
                      <div className="adm-field">
                        <label className="adm-label">Event ID</label>
                        <input
                          className="adm-input adm-input--mono"
                          placeholder="f.eks. 258952"
                          value={eqEventId}
                          onChange={(e) => setEqEventId(e.target.value)}
                        />
                      </div>
                      <div className="adm-field">
                        <label className="adm-label">Key</label>
                        <input
                          className="adm-input adm-input--mono"
                          placeholder="api key"
                          value={eqReportId}
                          onChange={(e) => setEqReportId(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="adm-field-row" style={{ marginTop: 8 }}>
                      <div className="adm-field">
                        <label className="adm-label">listName</label>
                        <input
                          className="adm-input adm-input--mono"
                          defaultValue="Online|Final"
                          value={rrExtra.listName}
                          onChange={(e) => setRrExtra((p) => ({ ...p, listName: e.target.value }))}
                        />
                      </div>
                      <div className="adm-field">
                        <label className="adm-label">Contest</label>
                        <input
                          className="adm-input adm-input--mono"
                          defaultValue="0"
                          value={rrExtra.contest}
                          onChange={(e) => setRrExtra((p) => ({ ...p, contest: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="adm-field" style={{ marginTop: 8 }}>
                      <label className="adm-label">Filter (valgfritt)</label>
                      <input
                        className="adm-input adm-input--mono"
                        placeholder='f.eks "10 km" eller tom'
                        value={rrExtra.filter}
                        onChange={(e) => setRrExtra((p) => ({ ...p, filter: e.target.value }))}
                      />
                    </div>
                  </>
                )}

                <button
                  className="adm-btn adm-btn--import"
                  onClick={runReimport}
                  disabled={importing || !eqEventId.trim()}
                  style={{ marginTop: 14 }}
                >
                  {importing
                    ? <><span className="adm-spinner" /> Importerer…</>
                    : `↓ Kjør ${importSource} import`
                  }
                </button>

                {importResult && (
                  <div className={`adm-reimport-result${importResult.ok ? " ok" : " err"}`}>
                    {importResult.ok ? (
                      <>
                        <div className="adm-reimport-result-title">✓ Import fullført</div>
                        <div className="adm-reimport-result-line">
                          {importResult.inserted != null && (
                            <span>{Number(importResult.inserted).toLocaleString("nb-NO")} resultater importert</span>
                          )}
                          {(importResult.skipped ?? 0) > 0 && (
                            <span className="adm-reimport-skipped">{importResult.skipped} hoppet over</span>
                          )}
                        </div>
                        {/* Show raw summary if available */}
                        {importResult.summary && (
                          <pre className="adm-reimport-pre">
                            {JSON.stringify(importResult.summary, null, 2)}
                          </pre>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="adm-reimport-result-title">✗ Import feilet</div>
                        <div className="adm-reimport-result-line">{importResult.error}</div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        <div className="adm-drawer-foot">
          {dirty && <button className="adm-btn adm-btn--primary" onClick={handleSave}>Lagre endringer</button>}
          <button className="adm-btn adm-btn--ghost" onClick={onClose}>{dirty ? "Avbryt" : "Lukk"}</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Series Drawer ──────────────────────────────────────────────────────── */
function SeriesDrawer({
  series, onClose, onSave, onDelete, onOpenEvent,
}: {
  series: SeriesDetail;
  onClose: () => void;
  onSave: (patch: object) => void;
  onDelete: () => void;
  onOpenEvent: (id: string) => void;
}) {
  const [name, setName]         = useState(series.name);
  const [location, setLocation] = useState(series.location ?? "");
  const [notes, setNotes]       = useState(series.notes ?? "");
  const [dirty, setDirty]       = useState(false);

  function mark<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setDirty(true); };
  }

  return (
    <div className="adm-drawer-backdrop" onClick={onClose}>
      <div className="adm-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="adm-drawer-head">
          <span className="adm-drawer-title">Serie: {series.name}</span>
          <button className="adm-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="adm-drawer-body">
          <div className="adm-field">
            <label className="adm-label">Serienavn</label>
            <input className="adm-input" value={name} onChange={(e) => mark(setName)(e.target.value)} />
          </div>
          <div className="adm-field-row">
            <div className="adm-field">
              <label className="adm-label">Slug</label>
              <div className="adm-readonly">{series.slug}</div>
            </div>
            <div className="adm-field">
              <label className="adm-label">By / Sted</label>
              <input className="adm-input" value={location} onChange={(e) => mark(setLocation)(e.target.value)} />
            </div>
          </div>
          <div className="adm-field">
            <label className="adm-label">Notater (admin)</label>
            <textarea
              className="adm-input adm-textarea"
              value={notes}
              onChange={(e) => mark(setNotes)(e.target.value)}
              placeholder="Interne notater om denne serien…"
              rows={3}
            />
          </div>

          {/* Editions */}
          <div className="adm-field">
            <label className="adm-label">
              Utgaver ({series.editions.length})
            </label>
            <div className="adm-editions">
              {series.editions.length === 0 && (
                <div className="adm-empty">Ingen events koblet til denne serien ennå.</div>
              )}
              {series.editions.map((ed, i) => (
                <div key={ed.id} className="adm-edition-row">
                  <div className="adm-edition-year">
                    {ed.start_date ? new Date(ed.start_date).getFullYear() : "—"}
                  </div>
                  <div className="adm-edition-info">
                    <span className="adm-edition-name">{ed.name}</span>
                    <span className="adm-edition-meta">
                      {ed.result_count.toLocaleString("nb-NO")} resultater · {ed.race_count} løp
                    </span>
                    <div>{ed.distances.map((d) => <DistBadge key={d} dist={d} />)}</div>
                  </div>
                  <div className="adm-edition-right">
                    {i === 0 && <span className="adm-edition-badge">Siste</span>}
                    <button className="adm-row-btn" onClick={() => onOpenEvent(ed.id)}>
                      Rediger →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="adm-drawer-foot">
          {dirty && (
            <button className="adm-btn adm-btn--primary" onClick={() => onSave({ name, location: location || null, notes: notes || null })}>
              Lagre
            </button>
          )}
          <button className="adm-btn adm-btn--ghost" onClick={onClose}>{dirty ? "Avbryt" : "Lukk"}</button>
          <button className="adm-btn adm-btn--danger" style={{ marginLeft: "auto" }} onClick={onDelete}>
            Slett serie
          </button>
        </div>
      </div>
    </div>
  );
}