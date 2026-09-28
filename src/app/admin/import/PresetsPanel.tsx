"use client";

import { useEffect, useState } from "react";
import { api, DistBadge, fmtDateTime, sourceLabel } from "./shared";

type Preset = {
  id: string;
  source_slug: string;
  source_event_id: string;
  source_race_id: string | null;
  event_name: string | null;
  start_date: string | null;
  location: string | null;
  race_name: string | null;
  distance_m: number | null;
  distance_category: string | null;
  updated_at: string;
};

export default function PresetsPanel() {
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    api<Preset[]>("/api/admin/presets").then((d) => alive && setPresets(d));
    return () => {
      alive = false;
    };
  }, [reload]);

  async function remove(id: string) {
    if (!confirm("Slette denne presetten?")) return;
    await api(`/api/admin/presets?id=${id}`, { method: "DELETE" });
    setReload((n) => n + 1);
  }

  return (
    <div className="imp-panel">
      <section className="imp-card imp-card--flush">
        <div className="adm-toolbar">
          <div style={{ flex: 1 }}>
            <h2 className="imp-h2" style={{ margin: 0 }}>
              Lagrede overstyringer (presets)
            </h2>
            <p className="imp-help" style={{ margin: "4px 0 0" }}>
              Brukes automatisk hver gang eventet importeres — også av crawleren.
            </p>
          </div>
        </div>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Kilde</th>
                <th>Event</th>
                <th>Løp</th>
                <th>Dato / sted</th>
                <th>Oppdatert</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!presets && (
                <tr>
                  <td colSpan={6} className="adm-loading">
                    Laster…
                  </td>
                </tr>
              )}
              {presets?.length === 0 && (
                <tr>
                  <td colSpan={6} className="adm-empty">
                    Ingen presets lagret
                  </td>
                </tr>
              )}
              {presets?.map((p) => (
                <tr key={p.id} className="adm-tr">
                  <td className="adm-td-mono">
                    {sourceLabel(p.source_slug)} #{p.source_event_id}
                  </td>
                  <td className="adm-td-name">{p.event_name ?? <span className="adm-warn">—</span>}</td>
                  <td>
                    <span className="adm-td-mono">{p.source_race_id || "hele eventet"}</span>
                    {p.race_name && <div>{p.race_name}</div>}
                    {p.distance_m && <span className="adm-td-mono"> {p.distance_m} m </span>}
                    {p.distance_category && <DistBadge dist={p.distance_category} />}
                  </td>
                  <td className="adm-td-mono">
                    {p.start_date ?? "—"}
                    {p.location ? ` · ${p.location}` : ""}
                  </td>
                  <td className="adm-td-mono">{fmtDateTime(p.updated_at)}</td>
                  <td>
                    <button className="adm-row-btn" onClick={() => remove(p.id)}>
                      Slett
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
