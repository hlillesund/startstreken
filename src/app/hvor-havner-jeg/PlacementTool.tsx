"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { MAIN_DISTANCES, formatDateShort, formatPace, formatTime } from "@/components/utovere/utils";
import { formatTopPercent } from "@/components/utovere/insights";
import type { Placement } from "@/lib/placement";

const nf = new Intl.NumberFormat("nb-NO");
const GENDERS = [
  { key: "A", label: "Alle", noun: "løpere" },
  { key: "M", label: "Herre", noun: "herrer" },
  { key: "F", label: "Dame", noun: "damer" },
] as const;
const DEFAULT_TIME: Record<string, number> = { "5K": 25 * 60, "10K": 50 * 60, HM: 1 * 3600 + 50 * 60, M: 3 * 3600 + 50 * 60 };

function split(sec: number) {
  return { h: Math.floor(sec / 3600), m: Math.floor((sec % 3600) / 60), s: sec % 60 };
}

/** One part of the time; keeps what you type while focused, then pads it. */
function Unit({ value, max, label, unit, pad, onChange }: { value: number; max: number; label: string; unit: string; pad: boolean; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (pad ? String(value).padStart(2, "0") : String(value));
  return (
    <label className="ss-place-unit">
      <input
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={2}
        value={shown}
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
          setDraft(raw);
          onChange(Math.min(max, Number(raw) || 0));
        }}
        onFocus={(e) => {
          setDraft("");
          e.target.select();
        }}
        onBlur={() => setDraft(null)}
        aria-label={label}
      />
      <span>{unit}</span>
    </label>
  );
}

function pct(v: number) {
  return `${Math.round(v * 100)} %`;
}

export default function PlacementTool() {
  const params = useSearchParams();
  const [dist, setDist] = useState(() => (MAIN_DISTANCES.some((d) => d.key === params.get("d")) ? params.get("d")! : "10K"));
  const [secs, setSecs] = useState(() => {
    const t = Number(params.get("t"));
    return Number.isFinite(t) && t >= 60 ? Math.round(t) : DEFAULT_TIME[dist];
  });
  const [gender, setGender] = useState(() => (params.get("g") === "M" || params.get("g") === "F" ? params.get("g")! : "A"));
  const [born, setBorn] = useState(() => params.get("f") ?? "");
  const [data, setData] = useState<Placement | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("loading");
  const seq = useRef(0);

  const d = MAIN_DISTANCES.find((x) => x.key === dist)!;
  const parts = split(secs);
  const by = /^\d{4}$/.test(born) ? Number(born) : null;

  useEffect(() => {
    const id = ++seq.current;
    const q = new URLSearchParams({ d: dist, t: String(secs), g: gender });
    if (by) q.set("f", String(by));
    window.history.replaceState(null, "", `?${q}`);
    const timer = setTimeout(() => {
      setState("loading");
      fetch(`/api/plassering?${q}`)
        .then((r) => r.json())
        .then((j) => {
          if (id !== seq.current) return;
          if (j?.ok) {
            setData(j);
            setState("idle");
          } else setState("error");
        })
        .catch(() => id === seq.current && setState("error"));
    }, 300);
    return () => clearTimeout(timer);
  }, [dist, secs, gender, by]);

  function setPart(part: "h" | "m" | "s", v: number) {
    const p = { ...parts, [part]: v };
    setSecs(Math.max(60, p.h * 3600 + p.m * 60 + p.s));
  }

  function pickDist(key: string) {
    setDist(key);
    setSecs(DEFAULT_TIME[key]);
  }

  const noun = GENDERS.find((g) => g.key === gender)!.noun;
  const nat = data?.national;
  const peak = useMemo(() => (nat ? Math.max(1, ...nat.histogram) : 1), [nat]);

  return (
    <div className="ss-place">
      <form className="ss-card ss-place-form ss-intro" style={{ "--d": "200ms" } as React.CSSProperties} onSubmit={(e) => e.preventDefault()}>
        <div className="ss-seg" role="tablist" aria-label="Distanse">
          {MAIN_DISTANCES.map((x) => (
            <button key={x.key} type="button" role="tab" aria-selected={dist === x.key} className={`ss-seg-btn${dist === x.key ? " active" : ""}`} onClick={() => pickDist(x.key)}>
              {x.short}
            </button>
          ))}
        </div>

        <fieldset className="ss-place-time">
          <legend>Tiden din</legend>
          <Unit value={parts.h} max={11} label="Timer" unit="t" pad={false} onChange={(v) => setPart("h", v)} />
          <Unit value={parts.m} max={59} label="Minutter" unit="min" pad onChange={(v) => setPart("m", v)} />
          <Unit value={parts.s} max={59} label="Sekunder" unit="sek" pad onChange={(v) => setPart("s", v)} />
          <span className="ss-place-pace">{formatPace(secs * 1000, d.meters)}</span>
        </fieldset>

        <div className="ss-place-row">
          <div className="ss-seg" role="tablist" aria-label="Kjønn">
            {GENDERS.map((g) => (
              <button key={g.key} type="button" role="tab" aria-selected={gender === g.key} className={`ss-seg-btn${gender === g.key ? " active" : ""}`} onClick={() => setGender(g.key)}>
                {g.label}
              </button>
            ))}
          </div>
          <label className="ss-place-born">
            <span>Født</span>
            <input inputMode="numeric" pattern="[0-9]*" maxLength={4} placeholder="åååå" value={born} onChange={(e) => setBorn(e.target.value.replace(/\D/g, "").slice(0, 4))} aria-label="Fødselsår (valgfritt)" />
          </label>
        </div>
      </form>

      <div className={`ss-place-out${state === "loading" ? " is-loading" : ""}`} aria-live="polite">
        {state === "error" && <div className="ss-card ss-empty">Kunne ikke regne ut plasseringen akkurat nå.</div>}

        {data && !nat && state !== "error" && (
          <div className="ss-card ss-empty">Ingen {noun} med resultater på {d.label.toLowerCase()} i {data.year} ennå.</div>
        )}

        {data && nat && state !== "error" && (
          <>
            <section className="ss-card ss-place-hero" key={`${dist}-${gender}`}>
              <div className="ss-place-kicker">{d.label} · {noun} i Norge · {data.year}</div>
              <div className="ss-place-big">
                Raskere enn <b>{pct(nat.beaten)}</b>
              </div>
              <div className="ss-place-sub">
                Plass {nf.format(nat.rank)} av {nf.format(nat.total)} med {formatTime(secs * 1000)}
              </div>

              <div className="ss-place-hist" aria-hidden="true">
                {nat.histogram.map((n, i) => (
                  <i key={i} className={i === nat.bin ? "is-you" : i < nat.bin ? "is-faster" : undefined} style={{ height: `${6 + (94 * n) / peak}%` }} />
                ))}
              </div>
              <div className="ss-place-axis" aria-hidden="true">
                <span>{formatTime(nat.min)}</span>
                <span>raskere ← → saktere</span>
                <span>{formatTime(nat.max)}</span>
              </div>

              <dl className="ss-place-marks">
                {nat.marks.map((m) => (
                  <div key={m.p}>
                    <dt>{m.p === 50 ? "Median" : `Topp ${m.p} %`}</dt>
                    <dd>{formatTime(m.t)}</dd>
                  </div>
                ))}
              </dl>
            </section>

            {data.ageClass && (
              <section className="ss-card ss-place-class">
                <div>
                  <div className="ss-place-kicker">Aldersklasse {data.ageClass.label}</div>
                  <div className="ss-place-mid">Plass {nf.format(data.ageClass.rank)} <em>av {nf.format(data.ageClass.total)}</em></div>
                </div>
                <div className="ss-place-badge">{pct(data.ageClass.beaten)}</div>
              </section>
            )}
            {!data.ageClass && gender !== "A" && (
              <p className="ss-place-hint">Legg inn fødselsåret for å se plasseringen i aldersklassen din.</p>
            )}

            {data.races.length > 0 && (
              <section className="ss-place-races">
                <h2 className="ss-place-h">I årets største løp</h2>
                <div className="ss-card">
                  <ul className="ss-rank-table">
                    {data.races.map((r) => (
                      <li key={r.race_id}>
                        <Link href={`/lop/${r.event_id}?race=${r.race_id}`} className="ss-rank-row ss-rank-row--norank">
                          <span style={{ minWidth: 0 }}>
                            <span className="ss-lb-name" style={{ display: "block" }}>{r.name}</span>
                            <span className="ss-lb-meta" style={{ display: "block" }}>
                              {[formatDateShort(r.date), r.location, `${nf.format(r.total - 1)} i mål`].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                          <span style={{ textAlign: "right", display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <span>
                              <span className="ss-lb-time" style={{ display: "block" }}>{nf.format(r.rank)}. plass</span>
                              <span className="ss-lb-meta" style={{ display: "block" }}>{formatTopPercent((r.rank / r.total) * 100)}</span>
                            </span>
                            <ChevronRight size={16} className="ss-muted" />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="ss-place-hint">Plassering sammenlagt i løpet, alle kjønn.</p>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
