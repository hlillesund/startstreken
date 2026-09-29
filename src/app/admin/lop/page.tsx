"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, DistBadge, fmtNum, Spinner } from "../import/shared";
import EventDrawer, { type EventDetail } from "./EventDrawer";
import { toast } from "./toast";

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface Edition { id: string; name: string; date: string | null; location: string | null; finishers: number }
interface Group {
  slug: string;
  name: string;
  location: string | null;
  seriesId: string | null;
  first: string | null;
  last: string | null;
  finishers: number;
  cats: string[];
  editions: Edition[];
}
interface Suggestion { a: string; b: string; score: number; reasons: string[] }
interface LopData { groups: Group[]; suggestions: Suggestion[]; redundant: { trivial: number; empty: number } }
interface EventRow {
  id: string;
  name: string;
  source_event_id: string;
  start_date: string | null;
  location: string | null;
  race_count: number;
  result_count: number;
  distances: string[];
}

const IGNORE_KEY = "admin-lop-ignored";
const year = (d: string | null) => d?.slice(0, 4) ?? "—";
const years = (g: Group) => (g.first && g.last ? (year(g.first) === year(g.last) ? year(g.first) : `${year(g.first)}–${year(g.last)}`) : "—");

function readIgnored(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(IGNORE_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

function SearchInput({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  return (
    <div className="adm-search-wrap">
      <svg className="adm-search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="5.5" cy="5.5" r="3.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8.5 8.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input className="adm-search" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} />
      {value && <button className="adm-search-clear" onClick={() => onChange("")}>✕</button>}
    </div>
  );
}

function matches(g: Group, q: string) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = `${g.name} ${g.slug} ${g.location ?? ""} ${g.editions.map((e) => e.name).join(" ")}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function AdminLopPage() {
  const [view, setView] = useState<"groups" | "suggestions" | "events">("groups");
  const [data, setData] = useState<LopData | null>(null);
  const [busy, setBusy] = useState(false);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [editEvent, setEditEvent] = useState<EventDetail | null>(null);
  const [ignored, setIgnored] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const d = await api<LopData & { ok: boolean }>("/api/admin/lop");
      setData(d);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Kunne ikke laste", "err");
    }
  }, []);

  useEffect(() => {
    load();
    setIgnored(readIgnored());
  }, [load]);

  const bySlug = useMemo(() => new Map((data?.groups ?? []).map((g) => [g.slug, g])), [data]);
  const groupOfEvent = useMemo(() => {
    const m = new Map<string, Group>();
    for (const g of data?.groups ?? []) for (const e of g.editions) m.set(e.id, g);
    return m;
  }, [data]);

  /** Runs a grouping action, then reloads. Returns false on error. */
  const act = useCallback(
    async (payload: Record<string, unknown>, done: string) => {
      setBusy(true);
      try {
        const res = await api<{ ok: boolean; error?: string; removed?: number }>("/api/admin/lop", { method: "POST", json: payload });
        if (!res.ok) throw new Error(res.error ?? "Feil");
        toast(res.removed != null ? `${done} (${res.removed})` : done);
        await load();
        return true;
      } catch (e) {
        toast(e instanceof Error ? e.message : "Feil", "err");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  async function openEvent(id: string) {
    const d = await api<{ ok: boolean; event: EventDetail }>(`/api/admin/events/${id}`).catch(() => null);
    if (d?.ok) setEditEvent(d.event);
    else toast("Kunne ikke laste event", "err");
  }

  async function saveEvent(ev: EventDetail, patch: object) {
    const res = await api<{ ok: boolean }>(`/api/admin/events/${ev.id}`, { method: "PATCH", json: patch }).catch(() => null);
    if (res?.ok) {
      toast("Lagret ✓");
      setEditEvent(null);
      load();
    } else toast("Feil ved lagring", "err");
  }

  async function saveRace(raceId: string, patch: object) {
    const res = await api<{ ok: boolean }>(`/api/admin/races/${raceId}`, { method: "PATCH", json: patch }).catch(() => null);
    if (res?.ok) toast("Løp lagret ✓");
    else toast("Feil", "err");
  }

  function ignore(s: Suggestion) {
    const next = new Set(ignored).add(`${s.a}|${s.b}`);
    setIgnored(next);
    try {
      localStorage.setItem(IGNORE_KEY, JSON.stringify([...next]));
    } catch {
      // private mode — ignored for this visit only
    }
  }

  const openSuggestions = (data?.suggestions ?? []).filter((s) => !ignored.has(`${s.a}|${s.b}`) && bySlug.has(s.a) && bySlug.has(s.b));
  const openGroup = openSlug ? bySlug.get(openSlug) ?? null : null;

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  return (
    <div className="adm-root">
      <div className="adm-topbar">
        <div className="adm-topbar-left">
          <span className="adm-logo">Admin</span>
          <span className="adm-logo-sep">/</span>
          <span className="adm-logo-page">Løp</span>
          <a className="adm-logo-page imp-toplink" href="/admin/import">Import →</a>
          {busy && <span className="imp-meta" style={{ marginLeft: 14 }}><Spinner /> Oppdaterer…</span>}
        </div>
        <div className="adm-tabs">
          <button className={`adm-tab${view === "groups" ? " act" : ""}`} onClick={() => setView("groups")}>
            Løp {data && <span className="adm-tab-count">{data.groups.length}</span>}
          </button>
          <button className={`adm-tab${view === "suggestions" ? " act" : ""}`} onClick={() => setView("suggestions")}>
            Forslag {openSuggestions.length > 0 && <span className="adm-tab-count">{openSuggestions.length}</span>}
          </button>
          <button className={`adm-tab${view === "events" ? " act" : ""}`} onClick={() => setView("events")}>Events</button>
          <button className="adm-tab" onClick={logout} title="Logg ut">⎋</button>
        </div>
      </div>

      <div className="imp-body">
        {!data ? (
          <div className="adm-loading" style={{ padding: 40 }}><Spinner /> Laster løp…</div>
        ) : view === "groups" ? (
          <GroupsTab data={data} busy={busy} act={act} onOpen={setOpenSlug} />
        ) : view === "suggestions" ? (
          <SuggestionsTab
            suggestions={openSuggestions}
            hidden={(data.suggestions.length - openSuggestions.length)}
            bySlug={bySlug}
            busy={busy}
            act={act}
            onIgnore={ignore}
            onShowIgnored={() => {
              setIgnored(new Set());
              try { localStorage.removeItem(IGNORE_KEY); } catch {}
            }}
            onOpen={setOpenSlug}
          />
        ) : (
          <EventsTab groups={data.groups} groupOfEvent={groupOfEvent} busy={busy} act={act} onOpenEvent={openEvent} onOpenGroup={setOpenSlug} />
        )}
      </div>

      {openGroup && (
        <GroupDrawer
          key={openGroup.slug}
          group={openGroup}
          groups={data?.groups ?? []}
          groupOfEvent={groupOfEvent}
          busy={busy}
          act={act}
          onClose={() => setOpenSlug(null)}
          onOpenEvent={openEvent}
        />
      )}

      {editEvent && (
        <EventDrawer
          event={editEvent}
          group={groupOfEvent.get(editEvent.id) ?? null}
          onClose={() => setEditEvent(null)}
          onSave={(patch) => saveEvent(editEvent, patch)}
          onSaveRace={saveRace}
          onOpenGroup={(slug) => { setEditEvent(null); setOpenSlug(slug); }}
        />
      )}
    </div>
  );
}

type Act = (payload: Record<string, unknown>, done: string) => Promise<boolean>;

/* ─── Løp (groups) ───────────────────────────────────────────────────────── */
function GroupsTab({ data, busy, act, onOpen }: { data: LopData; busy: boolean; act: Act; onOpen: (slug: string) => void }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "manual" | "multi" | "single">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const sig = `${q}|${filter}`;
  const [more, setMore] = useState({ sig, n: 100 });
  const shown = more.sig === sig ? more.n : 100;
  const [mergeName, setMergeName] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      data.groups
        .filter((g) =>
          filter === "manual" ? g.seriesId : filter === "multi" ? g.editions.length > 1 : filter === "single" ? g.editions.length === 1 : true
        )
        .filter((g) => !q || matches(g, q))
        .sort((a, b) => (b.last ?? "").localeCompare(a.last ?? "")),
    [data, q, filter]
  );

  const redundant = data.redundant.trivial + data.redundant.empty;
  const toggle = (slug: string) => setSelected((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]));
  const selGroups = selected.map((s) => data.groups.find((g) => g.slug === s)).filter(Boolean) as Group[];

  return (
    <div className="imp-panel">
      <div className="imp-card">
        <h2 className="imp-h2">Hvordan løp grupperes</h2>
        <p className="imp-help" style={{ marginBottom: 0 }}>
          Utgaver av samme løp samles automatisk når navnet er likt uten årstall og dato («Ulriken Opp 2024» og «Ulriken Opp 2026»).
          Når navnene er forskjellige («Fjordkraft Bergen City Marathon» / «Bergen City Marathon») slår du dem sammen her eller under
          <b> Forslag</b>. En manuell gruppering fanger også opp nye utgaver med samme navn som en av utgavene den allerede har.
          Kun fullstendig importerte events vises.
        </p>
        {redundant > 0 && (
          <div className="imp-overrides" style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span className="imp-meta" style={{ flex: 1 }}>
              {fmtNum(data.redundant.trivial)} serier inneholder bare ett event med samme navn, og {fmtNum(data.redundant.empty)} er tomme.
              De gjør ingenting og kan fjernes.
            </span>
            <button
              className="adm-btn adm-btn--ghost"
              disabled={busy}
              onClick={() => confirm(`Fjerne ${redundant} overflødige serier? Eventene beholdes.`) && act({ action: "cleanup" }, "Ryddet")}
            >
              Rydd opp
            </button>
          </div>
        )}
      </div>

      <div className="imp-card imp-card--flush">
        <div className="adm-toolbar">
          <SearchInput value={q} onChange={setQ} placeholder="Søk på løp, utgave eller sted…" />
          <select className="adm-select" style={{ width: "auto", flex: "0 0 auto" }} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">Alle</option>
            <option value="manual">Manuelt gruppert</option>
            <option value="multi">Flere utgaver</option>
            <option value="single">Én utgave</option>
          </select>
          <span className="imp-meta">{fmtNum(rows.length)} løp</span>
          {selected.length > 0 && (
            <div className="adm-bulk">
              <span className="adm-bulk-count">{selected.length} valgt</span>
              <button className="adm-btn adm-btn--primary" disabled={selected.length < 2 || busy} onClick={() => setMergeName(selGroups[0]?.name ?? "")}>
                Slå sammen
              </button>
              <button className="adm-btn adm-btn--ghost" onClick={() => setSelected([])}>Avbryt</button>
            </div>
          )}
        </div>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th style={{ width: 36 }} />
                <th>Løp</th>
                <th>Utgaver</th>
                <th>Sted</th>
                <th>Distanser</th>
                <th>Fullførte</th>
                <th>Gruppering</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} className="adm-empty">Ingen løp</td></tr>}
              {rows.slice(0, shown).map((g) => (
                <tr key={g.slug} className={`adm-tr${selected.includes(g.slug) ? " sel" : ""}`}>
                  <td><input type="checkbox" checked={selected.includes(g.slug)} onChange={() => toggle(g.slug)} /></td>
                  <td className="adm-td-name">
                    <span className="adm-name">{g.name}</span>
                    <span className="adm-source-id">/lop/{g.slug}</span>
                  </td>
                  <td className="adm-td-mono">{g.editions.length} · {years(g)}</td>
                  <td className="adm-td-mono">{g.location ?? "—"}</td>
                  <td>{g.cats.map((c) => <DistBadge key={c} dist={c} />)}</td>
                  <td className="adm-td-num">{fmtNum(g.finishers)}</td>
                  <td>{g.seriesId ? <span className="adm-series-tag">Manuell</span> : <span className="imp-meta">Navn</span>}</td>
                  <td><button className="adm-row-btn" onClick={() => onOpen(g.slug)}>Åpne →</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > shown && (
          <div className="adm-pagination">
            <button className="adm-page-btn" onClick={() => setMore({ sig, n: shown + 100 })}>Vis flere ({fmtNum(rows.length - shown)})</button>
          </div>
        )}
      </div>

      {mergeName !== null && (
        <div className="adm-modal-backdrop" onClick={() => setMergeName(null)}>
          <div className="adm-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-head">
              <span>Slå sammen {selGroups.length} løp</span>
              <button className="adm-modal-close" onClick={() => setMergeName(null)}>✕</button>
            </div>
            <div className="adm-modal-body">
              <div className="imp-meta" style={{ marginBottom: 12, lineHeight: 1.7 }}>
                {selGroups.map((g) => <div key={g.slug}>• {g.name} ({g.editions.length} utg., {years(g)})</div>)}
              </div>
              <label className="adm-label">Navn på løpet</label>
              <input className="adm-input" value={mergeName} onChange={(e) => setMergeName(e.target.value)} autoFocus />
            </div>
            <div className="adm-modal-foot">
              <button
                className="adm-btn adm-btn--primary"
                disabled={busy || !mergeName.trim()}
                onClick={async () => {
                  if (await act({ action: "merge", slugs: selected, name: mergeName.trim() }, "Slått sammen ✓")) {
                    setSelected([]);
                    setMergeName(null);
                  }
                }}
              >
                Slå sammen
              </button>
              <button className="adm-btn adm-btn--ghost" onClick={() => setMergeName(null)}>Avbryt</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Forslag ────────────────────────────────────────────────────────────── */
function SuggestionsTab({
  suggestions, hidden, bySlug, busy, act, onIgnore, onShowIgnored, onOpen,
}: {
  suggestions: Suggestion[];
  hidden: number;
  bySlug: Map<string, Group>;
  busy: boolean;
  act: Act;
  onIgnore: (s: Suggestion) => void;
  onShowIgnored: () => void;
  onOpen: (slug: string) => void;
}) {
  const Side = ({ g }: { g: Group }) => (
    <div className="lopadm-side">
      <button className="lopadm-name" onClick={() => onOpen(g.slug)}>{g.name}</button>
      <div className="imp-meta">
        {g.editions.length} utg. · {years(g)}{g.location ? ` · ${g.location}` : ""} · {fmtNum(g.finishers)} fullførte
      </div>
      <div style={{ marginTop: 4 }}>{g.cats.map((c) => <DistBadge key={c} dist={c} />)}</div>
    </div>
  );

  return (
    <div className="imp-panel">
      <div className="imp-card">
        <h2 className="imp-h2">Mulige samme løp</h2>
        <p className="imp-help" style={{ marginBottom: 0 }}>
          Løp med lignende navn, gjerne på samme sted og tid på året, som aldri er arrangert samme år. Slå sammen for å få statistikk på tvers
          av årene, eller ignorer forslaget.
          {hidden > 0 && (
            <> {hidden} ignorert — <button className="imp-disclosure" onClick={onShowIgnored}>vis igjen</button></>
          )}
        </p>
      </div>
      {suggestions.length === 0 && <div className="imp-card adm-empty">Ingen forslag akkurat nå.</div>}
      {suggestions.map((s) => {
        const A = bySlug.get(s.a)!, B = bySlug.get(s.b)!;
        return (
          <div key={`${s.a}|${s.b}`} className="imp-card lopadm-sugg">
            <div className="lopadm-pair">
              <Side g={A} />
              <span className="lopadm-vs">⇄</span>
              <Side g={B} />
            </div>
            <div className="imp-meta" style={{ marginTop: 10 }}>{s.reasons.join(" · ")}</div>
            <div className="imp-actions" style={{ marginTop: 12 }}>
              {[A, B].map((keep) => (
                <button
                  key={keep.slug}
                  className="adm-btn adm-btn--primary"
                  disabled={busy}
                  onClick={() => act({ action: "merge", slugs: [keep.slug, keep === A ? B.slug : A.slug], name: keep.name }, "Slått sammen ✓")}
                >
                  Slå sammen som «{keep.name}»
                </button>
              ))}
              <button className="adm-btn adm-btn--ghost" onClick={() => onIgnore(s)}>Ignorer</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Group drawer ───────────────────────────────────────────────────────── */
function GroupDrawer({
  group, groups, groupOfEvent, busy, act, onClose, onOpenEvent,
}: {
  group: Group;
  groups: Group[];
  groupOfEvent: Map<string, Group>;
  busy: boolean;
  act: Act;
  onClose: () => void;
  onOpenEvent: (id: string) => void;
}) {
  const [name, setName] = useState(group.name);
  const [mergeQ, setMergeQ] = useState("");
  const [addQ, setAddQ] = useState("");
  const [addRows, setAddRows] = useState<EventRow[] | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(debounce.current);
    if (addQ.trim().length < 2) return;
    debounce.current = setTimeout(() => {
      api<{ events: EventRow[] }>(`/api/admin/events?q=${encodeURIComponent(addQ.trim())}`)
        .then((d) => setAddRows(d.events ?? []))
        .catch(() => setAddRows([]));
    }, 280);
  }, [addQ]);

  const mergeHits = mergeQ.trim().length >= 2 ? groups.filter((g) => g.slug !== group.slug && matches(g, mergeQ)).slice(0, 8) : [];
  const own = new Set(group.editions.map((e) => e.id));

  async function split(ed: Edition) {
    const suggestion = [ed.name.replace(/\b(19|20)\d{2}\b/g, "").replace(/\s+/g, " ").trim(), ed.location].filter(Boolean).join(" ");
    const n = prompt(`Flytt «${ed.name}» ut til et eget løp. Navn på det nye løpet:`, suggestion);
    if (n?.trim()) await act({ action: "split", eventId: ed.id, name: n.trim() }, "Flyttet ut ✓");
  }

  return (
    <div className="adm-drawer-backdrop" onClick={onClose}>
      <div className="adm-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="adm-drawer-head">
          <span className="adm-drawer-title">Løp: {group.name}</span>
          <button className="adm-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="adm-drawer-body">
          <div className="adm-field">
            <label className="adm-label">Navn</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="adm-input" value={name} onChange={(e) => setName(e.target.value)} />
              <button
                className="adm-btn adm-btn--primary"
                disabled={busy || !name.trim() || name.trim() === group.name}
                onClick={() => act({ action: "rename", slug: group.slug, name: name.trim() }, "Navn lagret ✓")}
              >
                Lagre
              </button>
            </div>
            <div className="adm-field-hint imp-meta" style={{ marginTop: 6 }}>
              <a className="adm-link" href={`/lop/${group.slug}`} target="_blank" rel="noreferrer">/lop/{group.slug} ↗</a>
              {" · "}
              {group.seriesId ? "Manuelt gruppert" : "Gruppert automatisk etter navn"}
            </div>
          </div>

          <div className="adm-field">
            <label className="adm-label">Utgaver ({group.editions.length})</label>
            <div className="adm-editions">
              {group.editions.map((ed) => (
                <div key={ed.id} className="adm-edition-row">
                  <div className="adm-edition-year">{year(ed.date)}</div>
                  <div className="adm-edition-info">
                    <span className="adm-edition-name">{ed.name}</span>
                    <span className="adm-edition-meta">{[ed.date, ed.location, `${fmtNum(ed.finishers)} fullførte`].filter(Boolean).join(" · ")}</span>
                  </div>
                  <div className="adm-edition-right">
                    <button className="adm-row-btn" onClick={() => onOpenEvent(ed.id)}>Rediger</button>
                    {group.editions.length > 1 && (
                      <button className="adm-row-btn" disabled={busy} onClick={() => split(ed)}>Flytt ut</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="adm-field">
            <label className="adm-label">Slå sammen med et annet løp</label>
            <SearchInput value={mergeQ} onChange={setMergeQ} placeholder="Søk etter løp…" />
            {mergeHits.length > 0 && (
              <div className="adm-assign-list" style={{ marginTop: 8 }}>
                {mergeHits.map((g) => (
                  <div key={g.slug} className="adm-assign-row" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="adm-assign-name">{g.name}</div>
                      <div className="adm-assign-meta">{g.editions.length} utg. · {years(g)}{g.location ? ` · ${g.location}` : ""}</div>
                    </div>
                    <button
                      className="adm-btn adm-btn--primary"
                      disabled={busy}
                      onClick={async () => {
                        if (await act({ action: "merge", slugs: [group.slug, g.slug], name: group.name }, "Slått sammen ✓")) setMergeQ("");
                      }}
                    >
                      Slå sammen
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="adm-field">
            <label className="adm-label">Legg til events</label>
            <p className="imp-help" style={{ margin: "0 0 8px" }}>Også events som ikke er ferdig importert — de dukker opp her når resultatene er på plass.</p>
            <SearchInput value={addQ} onChange={setAddQ} placeholder="Søk på eventnavn, ID eller sted…" />
            {addRows && addQ.trim().length >= 2 && (
              <div className="adm-assign-list" style={{ marginTop: 8 }}>
                {addRows.length === 0 && <div className="adm-empty" style={{ padding: 12 }}>Ingen treff</div>}
                {addRows.map((ev) => {
                  const other = groupOfEvent.get(ev.id);
                  return (
                    <div key={ev.id} className="adm-assign-row" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="adm-assign-name">{ev.name}</div>
                        <div className="adm-assign-meta">
                          {[ev.start_date, ev.location, `${fmtNum(ev.result_count)} res.`, other && other.slug !== group.slug ? `i «${other.name}»` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </div>
                      {own.has(ev.id) ? (
                        <span className="imp-meta">Med</span>
                      ) : (
                        <button
                          className="adm-btn adm-btn--ghost"
                          disabled={busy}
                          onClick={() => act({ action: "add", slug: group.slug, eventIds: [ev.id] }, "Lagt til ✓")}
                        >
                          Legg til
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="adm-drawer-foot">
          <button className="adm-btn adm-btn--ghost" onClick={onClose}>Lukk</button>
          {group.seriesId && (
            <button
              className="adm-btn adm-btn--danger"
              style={{ marginLeft: "auto" }}
              disabled={busy}
              onClick={async () => {
                if (!confirm("Oppløse den manuelle grupperingen? Utgavene grupperes deretter kun etter navn.")) return;
                if (await act({ action: "dissolve", slug: group.slug }, "Oppløst")) onClose();
              }}
            >
              Oppløs gruppering
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Events ─────────────────────────────────────────────────────────────── */
function EventsTab({
  groups, groupOfEvent, busy, act, onOpenEvent, onOpenGroup,
}: {
  groups: Group[];
  groupOfEvent: Map<string, Group>;
  busy: boolean;
  act: Act;
  onOpenEvent: (id: string) => void;
  onOpenGroup: (slug: string) => void;
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<EventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assign, setAssign] = useState(false);
  const [assignQ, setAssignQ] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const loadEvents = useCallback((query: string, p: number) => {
    setLoading(true);
    api<{ events: EventRow[]; total: number; pages: number }>(`/api/admin/events?q=${encodeURIComponent(query)}&page=${p}`)
      .then((d) => { setRows(d.events ?? []); setTotal(d.total ?? 0); setPages(d.pages ?? 1); })
      .catch(() => toast("Kunne ikke laste events", "err"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => loadEvents(q, page), 280);
  }, [q, page, loadEvents]);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const hits = assignQ.trim().length >= 2 ? groups.filter((g) => matches(g, assignQ)).slice(0, 10) : [];

  return (
    <div className="imp-panel">
      <div className="imp-card imp-card--flush">
        <div className="adm-toolbar">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Søk på navn, ID eller by…" />
          <span className="imp-meta">{fmtNum(total)} events</span>
          {selected.size > 0 && (
            <div className="adm-bulk">
              <span className="adm-bulk-count">{selected.size} valgt</span>
              <button className="adm-btn adm-btn--primary" onClick={() => setAssign(true)}>Legg i løp…</button>
              <button className="adm-btn adm-btn--ghost" onClick={() => setSelected(new Set())}>Avbryt</button>
            </div>
          )}
        </div>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} />
                </th>
                <th>Navn</th>
                <th>Dato</th>
                <th>By</th>
                <th>Distanser</th>
                <th>Resultater</th>
                <th>Løp</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="adm-loading">Laster…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={8} className="adm-empty">Ingen events funnet</td></tr>}
              {!loading && rows.map((ev) => {
                const g = groupOfEvent.get(ev.id);
                return (
                  <tr key={ev.id} className={`adm-tr${selected.has(ev.id) ? " sel" : ""}`}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(ev.id)}
                        onChange={() => {
                          const s = new Set(selected);
                          if (s.has(ev.id)) s.delete(ev.id);
                          else s.add(ev.id);
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
                    <td>{ev.distances.length === 0 ? <span className="adm-warn">Ingen</span> : ev.distances.map((d) => <DistBadge key={d} dist={d} />)}</td>
                    <td className="adm-td-num">{fmtNum(ev.result_count)}</td>
                    <td>
                      {g ? (
                        <span className="adm-series-tag" onClick={() => onOpenGroup(g.slug)}>{g.name}</span>
                      ) : (
                        <span className="imp-meta" title="Vises ikke under /lop før resultatene er fullstendig importert">Ikke importert</span>
                      )}
                    </td>
                    <td><button className="adm-row-btn" onClick={() => onOpenEvent(ev.id)}>Rediger →</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="adm-pagination">
            <button className="adm-page-btn" disabled={page === 1} onClick={() => setPage(page - 1)}>← Forrige</button>
            <span className="adm-page-info">Side {page} av {pages} · {fmtNum(total)} totalt</span>
            <button className="adm-page-btn" disabled={page === pages} onClick={() => setPage(page + 1)}>Neste →</button>
          </div>
        )}
      </div>

      {assign && (
        <div className="adm-modal-backdrop" onClick={() => setAssign(false)}>
          <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-head">
              <span>Legg {selected.size} event{selected.size !== 1 ? "s" : ""} i løp</span>
              <button className="adm-modal-close" onClick={() => setAssign(false)}>✕</button>
            </div>
            <div className="adm-modal-body">
              <SearchInput value={assignQ} onChange={setAssignQ} placeholder="Søk etter løp…" autoFocus />
              <div className="adm-assign-list" style={{ marginTop: 12 }}>
                {hits.map((g) => (
                  <div
                    key={g.slug}
                    className="adm-assign-row"
                    onClick={async () => {
                      if (busy) return;
                      if (await act({ action: "add", slug: g.slug, eventIds: [...selected] }, `Lagt i «${g.name}» ✓`)) {
                        setAssign(false);
                        setSelected(new Set());
                        loadEvents(q, page);
                      }
                    }}
                  >
                    <div className="adm-assign-name">{g.name}</div>
                    <div className="adm-assign-meta">{g.editions.length} utgaver · {years(g)}</div>
                  </div>
                ))}
                {assignQ.trim().length >= 2 && hits.length === 0 && <div className="adm-empty" style={{ padding: "20px 0" }}>Ingen løp funnet</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
