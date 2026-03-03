"use client";

import { useMemo, useState } from "react";

type DistKey = "3K" | "5K" | "10K" | "HM" | "M";

const DISTANCES: { key: DistKey; label: string; meters: number }[] = [
  { key: "3K", label: "3000 m", meters: 3000 },
  { key: "5K", label: "5K", meters: 5000 },
  { key: "10K", label: "10K", meters: 10000 },
  { key: "HM", label: "Halvmaraton", meters: 21097 },
  { key: "M", label: "Maraton", meters: 42195 },
];

function pad(n: number) {
  return String(Math.floor(n)).padStart(2, "0");
}

function secsToHMS(secs: number) {
  const s = Math.max(0, Math.round(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return {
    h,
    m,
    s: r,
    fmt: h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`,
  };
}

function safeNum(x: string) {
  const v = parseFloat(x);
  return Number.isFinite(v) ? v : 0;
}

/**
 * Daniels-style VDOT core equations:
 * v in meters/minute, t in minutes, VO2 in ml/kg/min.
 */
function vo2FromVelocity(v_m_per_min: number) {
  return -4.6 + 0.182258 * v_m_per_min + 0.000104 * v_m_per_min * v_m_per_min;
}

function percentVo2maxFromTime(t_min: number) {
  return (
    0.8 +
    0.1894393 * Math.exp(-0.012778 * t_min) +
    0.2989558 * Math.exp(-0.1932605 * t_min)
  );
}

function vdotFromRace(distance_m: number, time_s: number) {
  const t = time_s / 60;
  const v = distance_m / t; // m/min
  const vo2 = vo2FromVelocity(v);
  const frac = percentVo2maxFromTime(t);
  if (frac <= 0) return 0;
  return vo2 / frac;
}

function velocityFromVo2(targetVo2: number) {
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.6 - targetVo2;
  const disc = b * b - 4 * a * c;
  if (disc <= 0) return 0;
  const v1 = (-b + Math.sqrt(disc)) / (2 * a);
  const v2 = (-b - Math.sqrt(disc)) / (2 * a);
  const v = Math.max(v1, v2);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

function minPerKmFromVelocity(v_m_per_min: number) {
  if (v_m_per_min <= 0) return 0;
  return 1000 / v_m_per_min; // minutes per km
}

function paceFmtFromMinPerKm(minPerKm: number) {
  const t = secsToHMS(minPerKm * 60);
  return `${t.fmt} /km`;
}

function kmhFromMinPerKm(minPerKm: number) {
  if (minPerKm <= 0) return 0;
  return 60 / minPerKm;
}

function formatPaceRange(minPerKmLow: number, minPerKmHigh: number) {
  // low = faster (smaller), high = slower (larger)
  const lo = Math.min(minPerKmLow, minPerKmHigh);
  const hi = Math.max(minPerKmLow, minPerKmHigh);
  return `${paceFmtFromMinPerKm(lo).replace(" /km", "")}–${paceFmtFromMinPerKm(hi).replace(
    " /km",
    ""
  )} /km`;
}

function formatKmhRange(minPerKmLow: number, minPerKmHigh: number) {
  const lo = Math.min(minPerKmLow, minPerKmHigh);
  const hi = Math.max(minPerKmLow, minPerKmHigh);
  const kmhFast = kmhFromMinPerKm(lo);
  const kmhSlow = kmhFromMinPerKm(hi);
  // Range as slow–fast to read naturally in km/h
  return `${kmhSlow.toFixed(1)}–${kmhFast.toFixed(1)} km/t`;
}

function hrRangeText(hrMax: number, loPct: number, hiPct: number) {
  const lo = Math.round(hrMax * loPct);
  const hi = Math.round(hrMax * hiPct);
  return `${lo}–${hi} bpm`;
}

function estimateHrMaxFromRaceAvg(avgHr: number, distKey: DistKey) {
  // Grovt anslag hvis bruker kun har snittpuls fra konkurranse.
  const fracByDist: Record<DistKey, number> = {
    "3K": 0.95,
    "5K": 0.93,
    "10K": 0.9,
    "HM": 0.88,
    "M": 0.84,
  };
  const frac = fracByDist[distKey] ?? 0.9;
  if (avgHr <= 0) return 0;
  return avgHr / frac;
}

/**
 * Given VDOT and distance, predict time by solving:
 * VDOT = VO2(v) / %VO2max(t), where v = d/t.
 * Bisection on time.
 */
function predictTimeSecondsFromVdot(distance_m: number, vdot: number) {
  if (vdot <= 0 || distance_m <= 0) return 0;

  const tFast = (distance_m / 1000) * 2 * 60; // 2:00/km
  const tSlow = (distance_m / 1000) * 10 * 60; // 10:00/km

  let lo = tFast;
  let hi = tSlow;

  const f = (time_s: number) => {
    const t_min = time_s / 60;
    const v = distance_m / t_min;
    const vo2 = vo2FromVelocity(v);
    const frac = percentVo2maxFromTime(t_min);
    const vdot_est = frac > 0 ? vo2 / frac : 0;
    return vdot_est - vdot;
  };

  let flo = f(lo);
  let fhi = f(hi);

  let tries = 0;
  while (flo * fhi > 0 && tries < 12) {
    hi *= 1.35;
    fhi = f(hi);
    tries++;
  }
  if (flo * fhi > 0) return Math.max(0, (lo + hi) / 2);

  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const fmid = f(mid);
    if (Math.abs(fmid) < 1e-6) return mid;
    if (flo * fmid <= 0) {
      hi = mid;
      fhi = fmid;
    } else {
      lo = mid;
      flo = fmid;
    }
  }
  return (lo + hi) / 2;
}

type TrainingRow = {
  key: string;
  label: string;
  paceRange: string;
  speedRange: string;
  hrRange?: string;
  hint?: string;
};

export default function VdotKalkulatorPage() {
  const [distKey, setDistKey] = useState<DistKey>("HM");
  const [hours, setHours] = useState("");
  const [mins, setMins] = useState("");
  const [secs, setSecs] = useState("");

  const [hrMaxInput, setHrMaxInput] = useState("");
  const [hrAvgInput, setHrAvgInput] = useState("");

  const [didCalc, setDidCalc] = useState(false);
  const [calcSnapshot, setCalcSnapshot] = useState<{
    distKey: DistKey;
    time_s: number;
    hrMax: number;
    distance_m: number;
  } | null>(null);

  const distance_m = DISTANCES.find((d) => d.key === distKey)?.meters ?? 0;
  const distLabel = DISTANCES.find((d) => d.key === distKey)?.label ?? "";

  const time_s_live = useMemo(() => {
    const h = safeNum(hours);
    const m = safeNum(mins);
    const s = safeNum(secs);
    return Math.max(0, h * 3600 + m * 60 + s);
  }, [hours, mins, secs]);

  const derivedHrMax_live = useMemo(() => {
    const hrMax = safeNum(hrMaxInput);
    if (hrMax > 0) return hrMax;

    const avg = safeNum(hrAvgInput);
    if (avg > 0) return estimateHrMaxFromRaceAvg(avg, distKey);
    return 0;
  }, [hrMaxInput, hrAvgInput, distKey]);

  const onCalculate = () => {
    const hrMax = derivedHrMax_live;
    setCalcSnapshot({
      distKey,
      time_s: time_s_live,
      hrMax,
      distance_m,
    });
    setDidCalc(true);
  };

  const snapshot = calcSnapshot;

  const vdot = useMemo(() => {
    if (!snapshot) return 0;
    if (snapshot.time_s <= 0 || snapshot.distance_m <= 0) return 0;
    return vdotFromRace(snapshot.distance_m, snapshot.time_s);
  }, [snapshot]);

  const avgPaceMinPerKm = useMemo(() => {
    if (!snapshot || snapshot.time_s <= 0 || snapshot.distance_m <= 0) return 0;
    return (snapshot.time_s / 60) / (snapshot.distance_m / 1000);
  }, [snapshot]);

  const training = useMemo<TrainingRow[]>(() => {
    if (!snapshot || vdot <= 0) return [];

    // RANGES (pct of VO2max ~ VDOT) -> then invert to pace range.
    // Adjusted Easy to be slower (lower %), so it won't spit out too "racey" easy pace.
    const targets = [
      {
        key: "easy",
        label: "Rolig (E)",
        pctLo: 0.59, // slower end
        pctHi: 0.72, // faster end (still easy-ish)
        hint: "rolig trening",
        hr: { lo: 0.65, hi: 0.78 },
      },
      {
        key: "threshold",
        label: "Terskel (T)",
        pctLo: 0.86,
        pctHi: 0.90,
        hint: "kontrollert hardt · typisk 20–40 min arbeid totalt",
        hr: { lo: 0.88, hi: 0.92 },
      },
      {
        key: "vo2",
        label: "VO₂max intervall (I)",
        pctLo: 0.95,
        pctHi: 1.0,
        hint: "hard intervall  ",
        hr: { lo: 0.93, hi: 0.97 },
      },
    ] as const;

    const hrMax = snapshot.hrMax;

    return targets.map((t) => {
      const vo2A = t.pctLo * vdot;
      const vo2B = t.pctHi * vdot;

      const vA = velocityFromVo2(vo2A);
      const vB = velocityFromVo2(vo2B);

      const paceA = minPerKmFromVelocity(vA);
      const paceB = minPerKmFromVelocity(vB);

      // For pace: lower min/km is faster. pctHi should be faster, so paceB should be smaller.
      const paceRange = formatPaceRange(paceB, paceA);
      const speedRange = formatKmhRange(paceB, paceA);

      const hrRange = hrMax > 0 ? hrRangeText(hrMax, t.hr.lo, t.hr.hi) : undefined;

      return {
        key: t.key,
        label: t.label,
        paceRange,
        speedRange,
        hrRange,
        hint: t.hint,
      };
    });
  }, [snapshot, vdot]);

  const equivalents = useMemo(() => {
    if (!snapshot || vdot <= 0) return [];
    return DISTANCES.map((d) => {
      const t = predictTimeSecondsFromVdot(d.meters, vdot);
      const pace = (t / 60) / (d.meters / 1000);
      return {
        key: d.key,
        label: d.label,
        time: secsToHMS(t).fmt,
        pace: paceFmtFromMinPerKm(pace),
      };
    });
  }, [snapshot, vdot]);

  const zones = useMemo(() => {
    if (!snapshot || snapshot.hrMax <= 0) return [];
    const hrMax = snapshot.hrMax;

    const z = [
      { z: "Sone 1", pct: [0.6, 0.7], hint: "veldig rolig / restitusjon" },
      { z: "Sone 2", pct: [0.7, 0.8], hint: "rolig / mengde" },
      { z: "Sone 3", pct: [0.8, 0.87], hint: "moderat" },
      { z: "Sone 4", pct: [0.87, 0.93], hint: "terskel / hardt" },
      { z: "Sone 5", pct: [0.93, 1.0], hint: "VO₂ / maks" },
    ];

    return z.map((x) => ({
      zone: x.z,
      range: `${Math.round(hrMax * x.pct[0])}–${Math.round(hrMax * x.pct[1])} bpm`,
      hint: x.hint,
    }));
  }, [snapshot]);

  const inputStyle: React.CSSProperties = {
    border: "1px solid #1a1a1a",
    outline: "none",
    background: "#fff",
    fontSize: 18,
    fontFamily: "'Syne', sans-serif",
    fontWeight: 600,
    padding: "12px 14px",
    color: "#1a1a1a",
    width: "100%",
    boxSizing: "border-box",
    textAlign: "center",
  };

  const monoHintStyle: React.CSSProperties = {
    fontSize: 10,
    fontFamily: "'DM Mono',monospace",
    color: "#aaa",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    marginBottom: 6,
    textAlign: "center",
  };

  const buttonStyle: React.CSSProperties = {
    border: "1px solid #1a1a1a",
    background: "#1a1a1a",
    color: "#fff",
    padding: "12px 14px",
    fontFamily: "'Syne', sans-serif",
    fontWeight: 700,
    fontSize: 16,
    cursor: "pointer",
    width: "100%",
  };

  const canCalc = time_s_live > 0 && distance_m > 0;

  return (
    <div className="cpn-root">
      <header className="cpn-header">
        <span className="cpn-logo">Verktøy / Løpsestimator</span>
        <span className="cpn-header-right">{new Date().getFullYear()} Season</span>
      </header>

      <div className="cpn-hero">
        <div>
          <div className="cpn-hero-eyebrow">Kalkulator / Løping</div>
          <h1 className="cpn-hero-title">Løpsestimator</h1>
        </div>
        <p className="cpn-hero-desc">
          Legg inn et løpsresultat → få treningsfart-områder og ekvivalente tider på andre distanser.
          (Puls er valgfritt.)
        </p>
      </div>

      <div className="cpn-profile" style={{ paddingTop: 28, paddingBottom: 80 }}>
        <div style={{ background: "#fff", border: "1px solid #1a1a1a", padding: 28 }}>
          {/* DISTANCE */}
          <div style={{ marginBottom: 18 }}>
            <div className="cpn-section-label" style={{ marginBottom: 10 }}>
              Distanse (resultatet ditt)
            </div>
            <div style={{ display: "flex", gap: 0, flexWrap: "wrap" }}>
              {DISTANCES.map((d) => (
                <button
                  key={d.key}
                  className={`cpn-sort-btn${distKey === d.key ? " active" : ""}`}
                  style={{ borderRight: "none" }}
                  onClick={() => setDistKey(d.key)}
                  type="button"
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* TIME INPUT */}
          <div style={{ marginBottom: 18 }}>
            <div className="cpn-section-label" style={{ marginBottom: 10 }}>
              Tid
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div>
                <div style={monoHintStyle}>Timer</div>
                <input
                  style={inputStyle}
                  placeholder="0"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  type="number"
                  min="0"
                />
              </div>
              <div>
                <div style={monoHintStyle}>Minutter</div>
                <input
                  style={inputStyle}
                  placeholder="00"
                  value={mins}
                  onChange={(e) => setMins(e.target.value)}
                  type="number"
                  min="0"
                  max="59"
                />
              </div>
              <div>
                <div style={monoHintStyle}>Sekunder</div>
                <input
                  style={inputStyle}
                  placeholder="00"
                  value={secs}
                  onChange={(e) => setSecs(e.target.value)}
                  type="number"
                  min="0"
                  max="59"
                />
              </div>
            </div>
          </div>

          {/* HR INPUTS */}
          <div style={{ marginBottom: 16 }}>
            <div className="cpn-section-label" style={{ marginBottom: 10 }}>
              Puls (valgfritt)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={monoHintStyle}>HFmaks</div>
                <input
                  style={inputStyle}
                  placeholder="f.eks. 195"
                  value={hrMaxInput}
                  onChange={(e) => setHrMaxInput(e.target.value)}
                  type="number"
                  min="0"
                />
              </div>
              <div>
                <div style={monoHintStyle}>Snittpuls i løpet</div>
                <input
                  style={inputStyle}
                  placeholder="f.eks. 176"
                  value={hrAvgInput}
                  onChange={(e) => setHrAvgInput(e.target.value)}
                  type="number"
                  min="0"
                />
              </div>
            </div>

            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                fontFamily: "'DM Mono',monospace",
                color: "#999",
                letterSpacing: "0.02em",
              }}
            >
              {safeNum(hrMaxInput) > 0 ? (
                <>Bruker HFmaks = {Math.round(safeNum(hrMaxInput))}.</>
              ) : safeNum(hrAvgInput) > 0 ? (
                <>HFmaks-estimat ≈ {Math.round(derivedHrMax_live)} (grovt) basert på snittpuls og distanse.</>
              ) : (
                <>Legg inn HFmaks eller snittpuls for puls-forslag og soneoversikt.</>
              )}
            </div>
          </div>

          {/* CALC BUTTON */}
          <button
            type="button"
            style={{ ...buttonStyle, opacity: canCalc ? 1 : 0.4, cursor: canCalc ? "pointer" : "not-allowed" }}
            onClick={() => canCalc && onCalculate()}
            disabled={!canCalc}
          >
            Kalkuler
          </button>
        </div>

        {/* OUTPUTS (only after calculate) */}
        {didCalc && snapshot && vdot > 0 ? (
          <>
            {/* TOP RESULT CARDS */}
            <div style={{ marginTop: 1 }}>
              <div style={{ background: "#fff", border: "1px solid #1a1a1a", borderTop: "none" }}>
                <div
                  style={{
                    padding: "12px 20px",
                    borderBottom: "1px solid #e8e4df",
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                  }}
                >
                  <span className="cpn-section-label" style={{ marginBottom: 0 }}>
                    Resultat
                  </span>
                  <span style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#aaa" }}>
                    {distLabel} · {secsToHMS(snapshot.time_s).fmt}
                  </span>
                </div>

                <div className="cpn-stat-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
                  <div className="cpn-stat accent">
                    
                    <div className="cpn-stat-value" style={{ fontSize: 30 }}>
                      {vdot.toFixed(1)}
                    </div>
                    <div className="cpn-stat-value">fitness score</div>
                  </div>

                  <div className="cpn-stat">
                    <div className="cpn-stat-label">Gj.snittpace</div>
                    <div className="cpn-stat-value" style={{ fontSize: 22 }}>
                      {paceFmtFromMinPerKm(avgPaceMinPerKm)}
                    </div>
                    <div className="cpn-stat-hint">i løpet</div>
                  </div>

                  <div className="cpn-stat">
                    <div className="cpn-stat-label">Gj.snittfart</div>
                    <div className="cpn-stat-value" style={{ fontSize: 22 }}>
                      {kmhFromMinPerKm(avgPaceMinPerKm).toFixed(1)} km/t
                    </div>
                    <div className="cpn-stat-hint">i løpet</div>
                  </div>
                </div>

                <div className="cpn-table-foot">
                  Treningsfartene er gitt som intervaller.
                </div>
              </div>
            </div>

            {/* TRAINING PACES */}
            <div style={{ marginTop: 1 }}>
              <div style={{ background: "#fff", border: "1px solid #1a1a1a", borderTop: "none" }}>
                <div
                  style={{
                    padding: "12px 20px",
                    borderBottom: "1px solid #e8e4df",
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                  }}
                >
                  <span className="cpn-section-label" style={{ marginBottom: 0 }}>
                    Treningsfarter (range)
                  </span>
                  <span style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#aaa" }}>
                    forslag
                  </span>
                </div>

                <div
                  className="cpn-pr-head"
                  style={{
                    gridTemplateColumns: snapshot.hrMax > 0 ? "1.2fr 1.2fr 1fr 1fr" : "1.2fr 1.2fr 1fr",
                  }}
                >
                  <div className="cpn-pr-th">Type</div>
                  <div className="cpn-pr-th">Pace</div>
                  <div className="cpn-pr-th">Fart</div>
                  {snapshot.hrMax > 0 && <div className="cpn-pr-th">Puls</div>}
                </div>

                {training.map((r) => (
                  <div
                    key={r.key}
                    className="cpn-tr"
                    style={{
                      gridTemplateColumns: snapshot.hrMax > 0 ? "1.2fr 1.2fr 1fr 1fr" : "1.2fr 1.2fr 1fr",
                    }}
                  >
                    <div className="cpn-td">
                      <span className="cpn-td-main">{r.label}</span>
                      {r.hint && <div className="cpn-td-sub">{r.hint}</div>}
                    </div>
                    <div className="cpn-td">
                      <span className="cpn-time" style={{ fontSize: 14 }}>
                        {r.paceRange}
                      </span>
                    </div>
                    <div className="cpn-td">{r.speedRange}</div>
                    {snapshot.hrMax > 0 && <div className="cpn-td">{r.hrRange ?? "—"}</div>}
                  </div>
                ))}

                <div className="cpn-table-foot">
                  Tips: “Rolig” kan variere mye dag til dag. På terskel: styr på pust/feel først, puls som støtte.
                </div>
              </div>
            </div>

            {/* EQUIVALENT RACES */}
            <div style={{ marginTop: 1 }}>
              <div style={{ background: "#fff", border: "1px solid #1a1a1a", borderTop: "none" }}>
                <div
                  style={{
                    padding: "12px 20px",
                    borderBottom: "1px solid #e8e4df",
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                  }}
                >
                  <span className="cpn-section-label" style={{ marginBottom: 0 }}>
                    Race equivalents
                  </span>
                  <span style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#aaa" }}>
                    samme fitness score
                  </span>
                </div>

                <div className="cpn-pr-head" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                  <div className="cpn-pr-th">Distanse</div>
                  <div className="cpn-pr-th">Tid</div>
                  <div className="cpn-pr-th">Pace</div>
                </div>

                {equivalents.map((e) => (
                  <div key={e.key} className="cpn-tr" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                    <div className="cpn-td">
                      <span className="cpn-td-main">{e.label}</span>
                      {e.key === snapshot.distKey && (
                        <div className="cpn-td-sub" style={{ color: "#999" }}>
                          (input)
                        </div>
                      )}
                    </div>
                    <div className="cpn-td">
                      <span className="cpn-time" style={{ fontSize: 14 }}>
                        {e.time}
                      </span>
                    </div>
                    <div className="cpn-td">{e.pace}</div>
                  </div>
                ))}

                <div className="cpn-table-foot">
                  Ekvivalenter antar “like gode forhold” og at du er like spesifikt trent på distansen.
                </div>
              </div>
            </div>

            {/* HR ZONES */}
            {snapshot.hrMax > 0 && (
              <div style={{ marginTop: 1 }}>
                <div style={{ background: "#fff", border: "1px solid #1a1a1a", borderTop: "none" }}>
                  <div
                    style={{
                      padding: "12px 20px",
                      borderBottom: "1px solid #e8e4df",
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                    }}
                  >
                    <span className="cpn-section-label" style={{ marginBottom: 0 }}>
                      Pulssoner (HFmaks)
                    </span>
                    <span style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#aaa" }}>
                      HFmaks ≈ {Math.round(snapshot.hrMax)}
                    </span>
                  </div>

                  <div className="cpn-pr-head" style={{ gridTemplateColumns: "1fr 1fr 2fr" }}>
                    <div className="cpn-pr-th">Sone</div>
                    <div className="cpn-pr-th">BPM</div>
                    <div className="cpn-pr-th">Beskrivelse</div>
                  </div>

                  {zones.map((z) => (
                    <div key={z.zone} className="cpn-tr" style={{ gridTemplateColumns: "1fr 1fr 2fr" }}>
                      <div className="cpn-td">
                        <span className="cpn-td-main">{z.zone}</span>
                      </div>
                      <div className="cpn-td">{z.range}</div>
                      <div className="cpn-td">{z.hint}</div>
                    </div>
                  ))}
                  
                </div>
              </div>
            )}
          </>
        ) : didCalc ? (
          <div
            style={{
              marginTop: 1,
              background: "#fff",
              border: "1px solid #1a1a1a",
              borderTop: "none",
              padding: "18px 20px",
              fontSize: 12,
              fontFamily: "'DM Mono',monospace",
              color: "#bbb",
              textAlign: "center",
              letterSpacing: "0.08em",
            }}
          >
            Ugyldig input — sjekk at du har satt tid og distanse riktig.
          </div>
        ) : null}
      </div>
    </div>
  );
}