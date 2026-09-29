"use client";

import { useState } from "react";
import { DistBadge } from "../import/shared";
import { toast } from "./toast";

export interface EventDetail {
  id: string;
  name: string;
  source_event_id: string;
  source_slug: string;
  start_date: string | null;
  location: string | null;
  pretty_url: string | null;
  races: {
    id: string;
    name: string;
    distance_category_override: string | null;
    inferred_distances: string[];
    result_count: number;
  }[];
}

/* ─── Event Drawer ───────────────────────────────────────────────────────── */
export default function EventDrawer({
  event, group, onClose, onSave, onSaveRace, onOpenGroup,
}: {
  event: EventDetail;
  group: { slug: string; name: string } | null;
  onClose: () => void;
  onSave: (patch: object) => void;
  onSaveRace: (id: string, patch: object) => void;
  onOpenGroup: (slug: string) => void;
}) {
  const [name, setName]           = useState(event.name);
  const [date, setDate]           = useState(event.start_date ?? "");
  const [location, setLocation]   = useState(event.location ?? "");
  const [dirty, setDirty]         = useState(false);
  const [races, setRaces]         = useState(event.races);

  // Reimport state
  const [showReimport, setShowReimport] = useState(false);
  const [ultDistance, setUltDistance]   = useState("");
  const [ultNation, setUltNation]       = useState("");
  const [importing, setImporting]       = useState(false);
  const [importResult, setImportResult] = useState<{
    ok: boolean;
    error?: string;
    inserted?: number;
    races?: { id: string; name: string; category: string; results: number }[];
    warnings?: string[];
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
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch(`/api/admin/events/${event.id}/reimport`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          event.source_slug === "ultimate" ? { ultimateDistance: ultDistance.trim(), nation: ultNation.trim() } : {}
        ),
      }).then((r) => r.json());
      setImportResult(res);
      if (res.ok) {
        toast("Import OK ✓");
        setRaces((prev) =>
          prev.map((r) => {
            const fresh = res.races?.find((x: { id: string }) => x.id === r.id);
            return fresh ? { ...r, result_count: fresh.results } : r;
          })
        );
      } else toast(res.error ?? "Import feilet", "err");
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
            <label className="adm-label">Kilde</label>
            <div className="adm-readonly">{event.source_slug} #{event.source_event_id}</div>
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

          {/* ── Løp (group) ── */}
          <div className="adm-field">
            <label className="adm-label">Løp</label>
            {group
              ? (
                <div className="adm-series-linked">
                  <span className="adm-series-tag" onClick={() => onOpenGroup(group.slug)}>{group.name}</span>
                  <span className="adm-series-slug">/lop/{group.slug}</span>
                </div>
              )
              : <div className="adm-warn">Ikke fullstendig importert, så eventet vises ikke under /lop ennå.</div>
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
                  Henter eventet på nytt fra {event.source_slug} (#{event.source_event_id}) og erstatter resultatene i
                  alle distansene. Navn, dato og distanse-overrides du har satt her beholdes.
                </p>

                {event.source_slug === "ultimate" && (
                  <div className="adm-field-row" style={{ marginTop: 12 }}>
                    <div className="adm-field">
                      <label className="adm-label">Kun distanse-ID (valgfritt)</label>
                      <input
                        className="adm-input adm-input--mono"
                        placeholder="alle"
                        value={ultDistance}
                        onChange={(e) => setUltDistance(e.target.value)}
                      />
                    </div>
                    <div className="adm-field">
                      <label className="adm-label">Kun nasjon (valgfritt)</label>
                      <input
                        className="adm-input adm-input--mono"
                        placeholder="f.eks. NOR"
                        value={ultNation}
                        onChange={(e) => setUltNation(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <button
                  className="adm-btn adm-btn--import"
                  onClick={runReimport}
                  disabled={importing}
                  style={{ marginTop: 14 }}
                >
                  {importing
                    ? <><span className="adm-spinner" /> Importerer…</>
                    : `↓ Reimporter fra ${event.source_slug}`
                  }
                </button>

                {importResult && (
                  <div className={`adm-reimport-result${importResult.ok ? " ok" : " err"}`}>
                    {importResult.ok ? (
                      <>
                        <div className="adm-reimport-result-title">✓ Import fullført</div>
                        <div className="adm-reimport-result-line">
                          {Number(importResult.inserted ?? 0).toLocaleString("nb-NO")} resultater importert
                        </div>
                        {importResult.races && (
                          <div className="adm-reimport-races">
                            {importResult.races.map((r) => (
                              <span key={r.id} className="adm-reimport-race-tag">
                                {r.name} · {r.category} · {r.results}
                              </span>
                            ))}
                          </div>
                        )}
                        {importResult.warnings?.map((w, i) => (
                          <div key={i} className="adm-reimport-result-line">⚠ {w}</div>
                        ))}
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
