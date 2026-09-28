"use client";

import { Fragment, useEffect, useState } from "react";
import { api, fmtDateTime, fmtDuration, fmtNum, sourceLabel, StatusBadge } from "./shared";
import { Warnings } from "./ImportPanel";

type Run = {
  id: string;
  source_slug: string;
  source_event_id: string;
  status: string;
  trigger: string | null;
  started_at: string;
  finished_at: string | null;
  error: string | null;
  event_id: string | null;
  stats: {
    eventName?: string;
    results?: number;
    durationMs?: number;
    warnings?: string[];
    races?: { id: string; name: string; category: string; results: number }[];
    athletes?: { persons: number; viaIdentity: number; viaName: number; created: number; enriched: number };
  } | null;
};
type Crawl = {
  id: string;
  trigger: string;
  status: string;
  started_at: string;
  error: string | null;
  stats: {
    durationMs?: number;
    discovery?: Record<string, { found: number; added: number; error?: string }> | null;
    processing?: { processed: number; imported: number; results: number; failed: number; remaining: number } | null;
  } | null;
};

const TRIGGERS: Record<string, string> = {
  manual: "manuell",
  reimport: "reimport",
  cron: "cron",
  queue: "kø",
  cli: "cli",
  backfill: "historikk",
};

export default function LogPanel() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [crawls, setCrawls] = useState<Crawl[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    api<{ runs: Run[]; crawls: Crawl[] }>("/api/admin/import-runs")
      .then((d) => {
        if (!alive) return;
        setRuns(d.runs.filter((r) => r.trigger !== "history"));
        setCrawls(d.crawls);
      })
      .catch((e) => alive && setError(String(e?.message ?? e)));
    return () => {
      alive = false;
    };
  }, [reload]);

  return (
    <div className="imp-panel">
      <section className="imp-card imp-card--flush">
        <div className="adm-toolbar">
          <h2 className="imp-h2" style={{ margin: 0, flex: 1 }}>
            Siste importer
          </h2>
          <button className="adm-btn adm-btn--ghost" onClick={() => setReload((n) => n + 1)}>
            Oppdater
          </button>
        </div>
        {error && <div className="adm-empty">{error}</div>}
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Tid</th>
                <th>Event</th>
                <th>Utløst av</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Resultater</th>
                <th style={{ textAlign: "right" }}>Varighet</th>
              </tr>
            </thead>
            <tbody>
              {!runs && (
                <tr>
                  <td colSpan={6} className="adm-loading">
                    Laster…
                  </td>
                </tr>
              )}
              {runs?.length === 0 && (
                <tr>
                  <td colSpan={6} className="adm-empty">
                    Ingen importer ennå
                  </td>
                </tr>
              )}
              {runs?.map((r) => (
                <Fragment key={r.id}>
                  <tr className="adm-tr" style={{ cursor: "pointer" }} onClick={() => setOpen(open === r.id ? null : r.id)}>
                    <td className="adm-td-mono">{fmtDateTime(r.started_at)}</td>
                    <td className="adm-td-name">
                      <span className="adm-name">{r.stats?.eventName ?? "—"}</span>
                      <span className="adm-source-id">
                        {sourceLabel(r.source_slug)} #{r.source_event_id}
                      </span>
                    </td>
                    <td className="adm-td-mono">{TRIGGERS[r.trigger ?? ""] ?? r.trigger ?? "—"}</td>
                    <td>
                      <StatusBadge status={r.status} />
                      {r.error && <span className="imp-err">{r.error.slice(0, 100)}</span>}
                    </td>
                    <td className="adm-td-num">{fmtNum(r.stats?.results)}</td>
                    <td className="adm-td-num">{fmtDuration(r.stats?.durationMs)}</td>
                  </tr>
                  {open === r.id && (
                    <tr>
                      <td colSpan={6} className="imp-detail">
                        {r.stats?.races?.map((race) => (
                          <div key={race.id}>
                            <a className="adm-link" href={`/lop/${race.id}`} target="_blank" rel="noreferrer">
                              {race.name}
                            </a>{" "}
                            · {race.category} · {fmtNum(race.results)} resultater
                          </div>
                        ))}
                        {r.stats?.athletes && (
                          <div style={{ marginTop: 6 }}>
                            Utøvere: {fmtNum(r.stats.athletes.persons)} · kjent via kilde-ID {fmtNum(r.stats.athletes.viaIdentity)} · navnematch{" "}
                            {fmtNum(r.stats.athletes.viaName)} · nye {fmtNum(r.stats.athletes.created)} · beriket{" "}
                            {fmtNum(r.stats.athletes.enriched)}
                          </div>
                        )}
                        <Warnings items={r.stats?.warnings ?? []} />
                        {r.error && <pre className="adm-reimport-pre">{r.error}</pre>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="imp-card imp-card--flush">
        <div className="adm-toolbar">
          <h2 className="imp-h2" style={{ margin: 0 }}>
            Crawler-kjøringer
          </h2>
        </div>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Tid</th>
                <th>Utløst av</th>
                <th>Status</th>
                <th>Funnet</th>
                <th>Importert</th>
                <th style={{ textAlign: "right" }}>Varighet</th>
              </tr>
            </thead>
            <tbody>
              {crawls.map((c) => (
                <tr key={c.id} className="adm-tr">
                  <td className="adm-td-mono">{fmtDateTime(c.started_at)}</td>
                  <td className="adm-td-mono">{TRIGGERS[c.trigger] ?? c.trigger}</td>
                  <td>
                    <StatusBadge status={c.status} title={c.error ?? undefined} />
                    {c.error && <span className="imp-err">{c.error.slice(0, 100)}</span>}
                  </td>
                  <td className="adm-td-mono">
                    {c.stats?.discovery
                      ? Object.entries(c.stats.discovery)
                          .map(([s, d]) => `${sourceLabel(s)} ${d.error ? "✗" : `${d.found}/${d.added} nye`}`)
                          .join(" · ")
                      : "—"}
                  </td>
                  <td className="adm-td-mono">
                    {c.stats?.processing
                      ? `${c.stats.processing.imported} løp · ${fmtNum(c.stats.processing.results)} res.${c.stats.processing.failed ? ` · ${c.stats.processing.failed} feil` : ""}`
                      : "—"}
                  </td>
                  <td className="adm-td-num">{fmtDuration(c.stats?.durationMs)}</td>
                </tr>
              ))}
              {crawls.length === 0 && (
                <tr>
                  <td colSpan={6} className="adm-empty">
                    Crawleren har ikke kjørt ennå
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
