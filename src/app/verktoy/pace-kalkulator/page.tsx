"use client";
import Image from "next/image";
import { useState } from "react";

type Mode = "pace" | "time" | "distance";

const DISTANCES = [
  { key: "5K",  label: "5K",          meters: 5000   },
  { key: "10K", label: "10K",         meters: 10000  },
  { key: "HM",  label: "Halvmaraton", meters: 21097  },
  { key: "M",   label: "Maraton",     meters: 42195  },
  { key: "custom", label: "Egendefinert", meters: null },
];

function pad(n: number) { return String(Math.floor(n)).padStart(2, "0"); }

function secsToHMS(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return { h, m, s, fmt: h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}` };
}
function getSplitPoints(distKm: number, distKey: string): number[] {
  if (distKey === "5K")  return [1, 2, 3, 4, 5];
  if (distKey === "10K") return [2.5, 5, 7.5, 10];
  if (distKey === "HM")  return [5, 10, 15, 20, 21.0975];
  if (distKey === "M")   return [5, 10, 15, 21.0975, 30, 40, 41.2, 42.195];
  // egendefinert: hver km opp til 10, deretter hver 5
  const points: number[] = [];
  if (distKm <= 10) {
    for (let i = 1; i <= Math.floor(distKm); i++) points.push(i);
  } else {
    for (let i = 5; i < distKm; i += 5) points.push(i);
  }
  points.push(distKm);
  return points;
}

function PaceCalculator() {
  const [mode, setMode] = useState<Mode>("pace");
  const [distKey, setDistKey] = useState("HM");
  const [customKm, setCustomKm] = useState("");
  const [hours, setHours] = useState("");
  const [mins, setMins] = useState("");
  const [secs, setSecs] = useState("");
  const [paceMin, setPaceMin] = useState("");
  const [paceSec, setPaceSec] = useState("");

  const distMeters = distKey === "custom"
    ? (parseFloat(customKm) || 0) * 1000
    : DISTANCES.find(d => d.key === distKey)?.meters ?? 0;
  const distKm = distMeters / 1000;

  // ── beregninger ──
  let result: { label: string; value: string; hint?: string }[] = [];

  if (mode === "pace") {
    // input: tid → output: pace + splits
    const totalSecs = (parseFloat(hours)||0)*3600 + (parseFloat(mins)||0)*60 + (parseFloat(secs)||0);
    if (totalSecs > 0 && distKm > 0) {
      const secsPerKm = totalSecs / distKm;
      const pace = secsToHMS(secsPerKm);
      const avg5 = secsToHMS(secsPerKm * 5);
      const avg10 = secsToHMS(secsPerKm * 10);
      result = [
        { label: "Pace", value: `${pace.fmt} /km`, hint: "gjennomsnittsfart" },
        { label: "5K split",  value: avg5.fmt,  hint: "ved samme pace" },
        { label: "10K split", value: avg10.fmt, hint: "ved samme pace" },
      ];
    }
  }

  if (mode === "time") {
    // input: pace → output: tid
    const paceSecs = (parseFloat(paceMin)||0)*60 + (parseFloat(paceSec)||0);
    if (paceSecs > 0 && distKm > 0) {
      const totalSecs = paceSecs * distKm;
      const t = secsToHMS(totalSecs);
      const speed = (3600 / paceSecs).toFixed(1);
      result = [
        { label: "Estimert tid", value: t.h > 0 ? `${t.h}:${pad(t.m)}:${pad(t.s)}` : `${pad(t.m)}:${pad(t.s)}`, hint: "målpasseringstid" },
        { label: "Fart", value: `${speed} km/t`, hint: "gjennomsnittshastighet" },
        { label: "Tid per mil", value: secsToHMS(paceSecs * 10).fmt, hint: "10 km" },
      ];
    }
  }

  if (mode === "distance") {
    // input: pace + tid → output: distanse
    const paceSecs = (parseFloat(paceMin)||0)*60 + (parseFloat(paceSec)||0);
    const totalSecs = (parseFloat(hours)||0)*3600 + (parseFloat(mins)||0)*60 + (parseFloat(secs)||0);
    if (paceSecs > 0 && totalSecs > 0) {
      const km = totalSecs / paceSecs;
      result = [
        { label: "Distanse", value: `${km.toFixed(2)} km`, hint: "tilbakelagt strekning" },
        { label: "Meter", value: `${Math.round(km * 1000)} m`, hint: "" },
      ];
    }
  }

  const inputCls: React.CSSProperties = {
    border: "1px solid #1a1a1a", outline: "none", background: "#fff",
    fontSize: 18, fontFamily: "'Syne', sans-serif", fontWeight: 600,
    padding: "12px 14px", color: "#1a1a1a", width: "100%", boxSizing: "border-box",
    textAlign: "center",
  };
  const smallInputCls: React.CSSProperties = { ...inputCls, fontSize: 15, fontWeight: 500 };

  return (
    <div>
      {/* MODE TABS */}
      <div className="cpn-tabs">
        {([["pace","Finn pace"],["time","Finn tid"],["distance","Finn distanse"]] as const).map(([k,l]) => (
          <button key={k} className={`cpn-tab${mode===k?" active":""}`} style={{ flex:1 }} onClick={() => setMode(k)}>{l}</button>
        ))}
      </div>

      <div style={{ background:"#fff", border:"1px solid #1a1a1a", borderTop:"none", padding:28 }}>

        {/* DISTANSE (vises for pace + time) */}
        {mode !== "distance" && (
          <div style={{ marginBottom:20 }}>
            <div className="cpn-section-label" style={{ marginBottom:10 }}>Distanse</div>
            <div style={{ display:"flex", gap:0, flexWrap:"wrap" }}>
              {DISTANCES.map(d => (
                <button key={d.key}
                  className={`cpn-sort-btn${distKey===d.key?" active":""}`}
                  style={{ borderRight:"none" }}
                  onClick={() => setDistKey(d.key)}>
                  {d.label}
                </button>
              ))}
              <button
                className={`cpn-sort-btn${distKey==="custom"?" active":""}`}
                onClick={() => setDistKey("custom")}>
                Egendefinert
              </button>
            </div>
            {distKey === "custom" && (
              <div style={{ marginTop:10 }}>
                <input style={{ ...smallInputCls, textAlign:"left", width:160 }}
                  placeholder="Kilometer, f.eks. 8.5"
                  value={customKm}
                  onChange={e => setCustomKm(e.target.value)} />
              </div>
            )}
          </div>
        )}

        {/* INPUTS */}
        {(mode === "pace" || mode === "distance") && (
          <div style={{ marginBottom:20 }}>
            <div className="cpn-section-label" style={{ marginBottom:10 }}>
              {mode === "pace" ? "Målsettid" : "Løpetid"}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
              <div>
                <div style={{ fontSize:9, fontFamily:"'DM Mono',monospace", letterSpacing:"0.14em", textTransform:"uppercase", color:"#888", marginBottom:4, textAlign:"center" }}>Timer</div>
                <input style={inputCls} placeholder="0" value={hours} onChange={e => setHours(e.target.value)} type="number" min="0" />
              </div>
              <div>
                <div style={{ fontSize:9, fontFamily:"'DM Mono',monospace", letterSpacing:"0.14em", textTransform:"uppercase", color:"#888", marginBottom:4, textAlign:"center" }}>Minutter</div>
                <input style={inputCls} placeholder="00" value={mins} onChange={e => setMins(e.target.value)} type="number" min="0" max="59" />
              </div>
              <div>
                <div style={{ fontSize:9, fontFamily:"'DM Mono',monospace", letterSpacing:"0.14em", textTransform:"uppercase", color:"#888", marginBottom:4, textAlign:"center" }}>Sekunder</div>
                <input style={inputCls} placeholder="00" value={secs} onChange={e => setSecs(e.target.value)} type="number" min="0" max="59" />
              </div>
            </div>
          </div>
        )}

        {(mode === "time" || mode === "distance") && (
          <div style={{ marginBottom:20 }}>
            <div className="cpn-section-label" style={{ marginBottom:10 }}>Pace</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              <div>
                <div style={{ fontSize:9, fontFamily:"'DM Mono',monospace", letterSpacing:"0.14em", textTransform:"uppercase", color:"#888", marginBottom:4, textAlign:"center" }}>Min / km</div>
                <input style={inputCls} placeholder="5" value={paceMin} onChange={e => setPaceMin(e.target.value)} type="number" min="0" />
              </div>
              <div>
                <div style={{ fontSize:9, fontFamily:"'DM Mono',monospace", letterSpacing:"0.14em", textTransform:"uppercase", color:"#888", marginBottom:4, textAlign:"center" }}>Sek / km</div>
                <input style={inputCls} placeholder="30" value={paceSec} onChange={e => setPaceSec(e.target.value)} type="number" min="0" max="59" />
              </div>
            </div>
          </div>
        )}

        {/* RESULTS */}
        {result.length > 0 && (
          <div style={{ marginTop:8 }}>
            <div className="cpn-section-label" style={{ marginBottom:0 }}>Resultat</div>
            <div className="cpn-stat-grid" style={{ gridTemplateColumns:`repeat(${result.length},1fr)`, marginTop:0 }}>
              {result.map((r, i) => (
                <div key={i} className={`cpn-stat${i===0?" accent":""}`}>
                  <div className="cpn-stat-label">{r.label}</div>
                  <div className="cpn-stat-value" style={{ fontSize: i===0 ? 28 : 20 }}>{r.value}</div>
                  {r.hint && <div className="cpn-stat-hint">{r.hint}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {result.length === 0 && (
          <div style={{ marginTop:8, padding:"20px 0", fontSize:12, fontFamily:"'DM Mono',monospace", color:"#bbb", textAlign:"center", letterSpacing:"0.08em" }}>
            Fyll inn verdiene over for å se resultat
          </div>
        )}
      </div>

      {/* SPLITS TABLE */}
      {mode === "pace" && result.length > 0 && (() => {
        const totalSecs = (parseFloat(hours)||0)*3600 + (parseFloat(mins)||0)*60 + (parseFloat(secs)||0);
        const secsPerKm = totalSecs / distKm;
        const splits = Array.from({ length: Math.min(Math.ceil(distKm), 42) }, (_, i) => {
          const km = i + 1;
          const t = secsToHMS(secsPerKm * km);
          return { km, time: t.h > 0 ? `${t.h}:${pad(t.m)}:${pad(t.s)}` : `${pad(t.m)}:${pad(t.s)}` };
        });
        return (
          <div style={{ marginTop:1 }}>
            <div style={{ background:"#fff", border:"1px solid #1a1a1a", borderTop:"none" }}>
              <div style={{ padding:"12px 20px", borderBottom:"1px solid #e8e4df", display:"flex", alignItems:"baseline", justifyContent:"space-between" }}>
                <span className="cpn-section-label" style={{ marginBottom:0 }}>Kilometersplits</span>
                <span style={{ fontSize:10, fontFamily:"'DM Mono',monospace", color:"#aaa" }}>{splits.length} km</span>
              </div>
              <div className="cpn-pr-head" style={{ gridTemplateColumns:"80px 1fr 1fr" }}>
                <div className="cpn-pr-th">Km</div>
                <div className="cpn-pr-th">Pace</div>
                <div className="cpn-pr-th">Passering</div>
              </div>
              {splits.map(s => (
                <div key={s.km} className="cpn-tr" style={{ gridTemplateColumns:"80px 1fr 1fr" }}>
                  <div className="cpn-td"><span className="cpn-td-main">{s.km}</span></div>
                  <div className="cpn-td">{secsToHMS(secsPerKm).fmt} /km</div>
                  <div className="cpn-td"><span className="cpn-time" style={{ fontSize:14 }}>{s.time}</span></div>
                </div>
              ))}
              <div className="cpn-table-foot">Splits ved jevn pace · {DISTANCES.find(d=>d.key===distKey)?.label ?? `${distKm} km`}</div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default function PaceKalkulatorPage() {
  return (
    <div className="cpn-root">

      <header className="cpn-header">
                <meta name="google-adsense-account" content="ca-pub-7553946899442750"></meta>

        <span className="cpn-logo">Verktøy / Pace</span>
        <span className="cpn-header-right">{new Date().getFullYear()} Season</span>
      </header>

      <div className="cpn-hero">
        <div>
          <div className="cpn-hero-eyebrow">Kalkulator / Løping</div>
          <h1 className="cpn-hero-title">Pace</h1>
        </div>
        <p className="cpn-hero-desc">
          Finn hvilken fart du må holde for å nå målet ditt — eller beregn sluttid og distanse fra pace.
        </p>
      </div>

      <div className="cpn-profile" style={{ paddingTop:40, paddingBottom:80 }}>
        <PaceCalculator />
      </div>

    </div>
  );
}