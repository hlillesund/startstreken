"use client";

import { useMemo, useState } from "react";
import { api, CATEGORIES, DistBadge, fmtDuration, fmtNum, sourceLabel, SOURCES, Spinner } from "./shared";

type PreviewRace = { sourceRaceId: string; name: string; distanceM: number | null; category: string; finishers: number };
type Preview = {
  source: string;
  sourceEventId: string;
  name: string | null;
  date: string | null;
  location: string | null;
  url: string | null;
  races: PreviewRace[];
  warnings: string[];
};
type ImportResponse = {
  ok: boolean;
  status?: "imported" | "no_results" | "failed";
  error?: string;
  message?: string;
  durationMs?: number;
  summary?: {
    eventId: string;
    eventName: string;
    eventDate: string | null;
    results: number;
    races: { id: string; name: string; category: string; distanceM: number | null; results: number }[];
    athletes: { persons: number; viaIdentity: number; viaName: number; created: number; enriched: number };
    warnings: string[];
  };
};

/** Client-side mirror of parseEventRef, for instant feedback while typing. */
function detectSource(ref: string): string | null {
  const s = ref.toLowerCase();
  if (s.includes("eqtiming")) return "eqtiming";
  if (s.includes("ultimate.dk")) return "ultimate";
  if (s.includes("raceresult")) return "raceresult";
  if (s.includes("racedays")) return "racedays";
  return null;
}

const emptyOverride = { event_name: "", start_date: "", location: "", race_name: "", distance_m: "", distance_category: "" };

export default function ImportPanel() {
  const [ref, setRef] = useState("");
  const [manualSource, setManualSource] = useState("eqtiming");
  const [ultDistance, setUltDistance] = useState("");
  const [nation, setNation] = useState("");
  const [showOverrides, setShowOverrides] = useState(false);
  const [override, setOverride] = useState(emptyOverride);
  const [savePreset, setSavePreset] = useState(false);

  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);

  const detected = useMemo(() => detectSource(ref), [ref]);
  const source = detected ?? manualSource;

  function payload() {
    return {
      ref: ref.trim(),
      source,
      ultimateDistance: source === "ultimate" ? ultDistance : null,
      nation: source === "ultimate" ? nation : null,
    };
  }

  async function runPreview() {
    setBusy("preview");
    setError(null);
    setResult(null);
    try {
      const d = await api<{ ok: boolean; preview?: Preview; error?: string }>("/api/admin/import", {
        method: "POST",
        json: { ...payload(), preview: true },
      });
      if (!d.ok || !d.preview) throw new Error(d.error ?? "Forhåndsvisning feilet");
      setPreview(d.preview);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPreview(null);
    } finally {
      setBusy(null);
    }
  }

  async function runImport() {
    setBusy("import");
    setError(null);
    setResult(null);
    try {
      const d = await api<ImportResponse>("/api/admin/import", {
        method: "POST",
        json: {
          ...payload(),
          savePreset,
          override: {
            ...override,
            distance_m: override.distance_m ? Number(override.distance_m) : null,
            distance_category: override.distance_category || null,
          },
        },
      });
      setResult(d);
      if (d.status !== "imported") setError(d.error ?? d.message ?? "Import feilet");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const setO = (k: keyof typeof emptyOverride) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setOverride((o) => ({ ...o, [k]: e.target.value }));

  const canSubmit = ref.trim().length > 0 && !busy;

  return (
    <div className="imp-panel">
      <section className="imp-card">
        <h2 className="imp-h2">Importer ett løp</h2>
        <p className="imp-help">
          Lim inn lenken til resultatsiden (EQ Timing, Ultimate, RaceResult eller Racedays) — eller bare event-ID-en. Alle distanser
          i eventet importeres, med distanse, kjønn og fødselsår der kilden har det.
        </p>

        <div className="imp-row">
          <div className="adm-field" style={{ flex: 1, minWidth: 260 }}>
            <label className="adm-label">Lenke eller event-ID</label>
            <input
              className="adm-input adm-input--mono"
              placeholder="https://live.eqtiming.com/80410  ·  my.raceresult.com/258952  ·  7382"
              value={ref}
              onChange={(e) => {
                setRef(e.target.value);
                setPreview(null);
                setResult(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && canSubmit && runPreview()}
            />
          </div>
          <div className="adm-field" style={{ width: 180 }}>
            <label className="adm-label">Kilde</label>
            {detected ? (
              <div className="adm-readonly">{sourceLabel(detected)} ✓</div>
            ) : (
              <select className="adm-select" value={manualSource} onChange={(e) => setManualSource(e.target.value)}>
                {SOURCES.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {source === "ultimate" && (
          <div className="imp-row">
            <div className="adm-field" style={{ width: 200 }}>
              <label className="adm-label">Kun distanse-ID (valgfritt)</label>
              <input className="adm-input adm-input--mono" placeholder="alle" value={ultDistance} onChange={(e) => setUltDistance(e.target.value)} />
            </div>
            <div className="adm-field" style={{ width: 200 }}>
              <label className="adm-label">Kun nasjon (valgfritt)</label>
              <input className="adm-input adm-input--mono" placeholder="f.eks. NOR" value={nation} onChange={(e) => setNation(e.target.value)} />
              <span className="adm-field-hint">For utenlandske løp: importer bare nordmenn. Plasseringer hentes da fra kilden.</span>
            </div>
          </div>
        )}

        <button type="button" className="imp-disclosure" onClick={() => setShowOverrides((v) => !v)}>
          {showOverrides ? "▾" : "▸"} Overstyringer (valgfritt)
        </button>
        {showOverrides && (
          <div className="imp-overrides">
            <div className="imp-grid">
              <div className="adm-field">
                <label className="adm-label">Eventnavn</label>
                <input className="adm-input" value={override.event_name} onChange={setO("event_name")} placeholder="Fra kilden" />
              </div>
              <div className="adm-field">
                <label className="adm-label">Dato</label>
                <input type="date" className="adm-input" value={override.start_date} onChange={setO("start_date")} />
              </div>
              <div className="adm-field">
                <label className="adm-label">Sted</label>
                <input className="adm-input" value={override.location} onChange={setO("location")} />
              </div>
            </div>
            <p className="adm-field-hint" style={{ margin: "10px 0 6px" }}>
              Løpsfeltene under brukes bare når eventet har én distanse. For flere distanser: bruk «Override distanse» på
              løpet under Admin › Løp etter import.
            </p>
            <div className="imp-grid">
              <div className="adm-field">
                <label className="adm-label">Løpsnavn</label>
                <input className="adm-input" value={override.race_name} onChange={setO("race_name")} />
              </div>
              <div className="adm-field">
                <label className="adm-label">Distanse (meter)</label>
                <input className="adm-input adm-input--mono" inputMode="numeric" value={override.distance_m} onChange={setO("distance_m")} />
              </div>
              <div className="adm-field">
                <label className="adm-label">Kategori</label>
                <select className="adm-select" value={override.distance_category} onChange={setO("distance_category")}>
                  <option value="">Automatisk</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="imp-check">
              <input type="checkbox" checked={savePreset} onChange={(e) => setSavePreset(e.target.checked)} />
              Lagre som preset, så overstyringene også brukes ved senere automatiske reimporter
            </label>
          </div>
        )}

        <div className="imp-actions">
          <button className="adm-btn adm-btn--ghost" onClick={runPreview} disabled={!canSubmit}>
            {busy === "preview" ? <Spinner /> : null} Forhåndsvis
          </button>
          <button className="adm-btn adm-btn--primary" onClick={runImport} disabled={!canSubmit}>
            {busy === "import" ? <Spinner /> : null} {busy === "import" ? "Importerer…" : "Importer"}
          </button>
        </div>

        {error && (
          <div className="adm-reimport-result err" style={{ marginTop: 14 }}>
            <div className="adm-reimport-result-title">✗ {result?.status === "no_results" ? "Ingen resultater" : "Feil"}</div>
            <div className="adm-reimport-result-line">{error}</div>
          </div>
        )}
      </section>

      {preview && !result && (
        <section className="imp-card">
          <div className="imp-card-head">
            <div>
              <h2 className="imp-h2">{preview.name ?? "(uten navn)"}</h2>
              <div className="imp-meta">
                {sourceLabel(preview.source)} #{preview.sourceEventId} · {preview.date ?? "ukjent dato"}
                {preview.location ? ` · ${preview.location}` : ""}
                {preview.url && (
                  <>
                    {" · "}
                    <a className="adm-link" href={preview.url} target="_blank" rel="noreferrer">
                      åpne kilde ↗
                    </a>
                  </>
                )}
              </div>
            </div>
            <button className="adm-btn adm-btn--primary" onClick={runImport} disabled={!!busy}>
              {busy === "import" ? <Spinner /> : null} Importer {fmtNum(preview.races.reduce((n, r) => n + r.finishers, 0))} resultater
            </button>
          </div>
          <RaceTable races={preview.races.map((r) => ({ key: r.sourceRaceId, name: r.name, distanceM: r.distanceM, category: r.category, count: r.finishers }))} />
          <Warnings items={preview.warnings} />
        </section>
      )}

      {result?.status === "imported" && result.summary && (
        <section className="imp-card">
          <div className="adm-reimport-result ok" style={{ margin: 0 }}>
            <div className="adm-reimport-result-title">✓ {result.summary.eventName}</div>
            <div className="adm-reimport-result-line">
              {fmtNum(result.summary.results)} resultater i {result.summary.races.length} løp · {fmtDuration(result.durationMs)}
            </div>
            <div className="adm-reimport-result-line">
              Utøvere: {fmtNum(result.summary.athletes.persons)} totalt — {fmtNum(result.summary.athletes.viaIdentity)} kjent fra
              før via kilde-ID, {fmtNum(result.summary.athletes.viaName)} matchet på navn, {fmtNum(result.summary.athletes.created)} nye
              {result.summary.athletes.enriched ? `, ${fmtNum(result.summary.athletes.enriched)} fikk kjønn/fødselsår` : ""}
            </div>
          </div>
          <RaceTable
            races={result.summary.races.map((r) => ({ key: r.id, name: r.name, distanceM: r.distanceM, category: r.category, count: r.results, href: `/lop/${r.id}` }))}
          />
          <Warnings items={result.summary.warnings} />
        </section>
      )}
    </div>
  );
}

function RaceTable({ races }: { races: { key: string; name: string; distanceM: number | null; category: string; count: number; href?: string }[] }) {
  return (
    <div className="adm-table-wrap" style={{ marginTop: 14 }}>
      <table className="adm-table">
        <thead>
          <tr>
            <th>Løp</th>
            <th>Distanse</th>
            <th>Kategori</th>
            <th style={{ textAlign: "right" }}>Resultater</th>
          </tr>
        </thead>
        <tbody>
          {races.map((r) => (
            <tr key={r.key} className="adm-tr">
              <td className="adm-td-name">
                {r.href ? (
                  <a className="adm-link" href={r.href} target="_blank" rel="noreferrer">
                    {r.name}
                  </a>
                ) : (
                  r.name
                )}
              </td>
              <td className="adm-td-mono">{r.distanceM ? `${(r.distanceM / 1000).toLocaleString("nb-NO")} km` : "—"}</td>
              <td>
                <DistBadge dist={r.category} />
              </td>
              <td className="adm-td-num">{fmtNum(r.count)}</td>
            </tr>
          ))}
          {races.length === 0 && (
            <tr>
              <td colSpan={4} className="adm-empty">
                Ingen løp med resultater
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Warnings({ items }: { items: string[] }) {
  if (!items?.length) return null;
  return (
    <ul className="imp-warnings">
      {items.map((w, i) => (
        <li key={i}>⚠ {w}</li>
      ))}
    </ul>
  );
}
