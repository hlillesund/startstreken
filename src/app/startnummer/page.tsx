"use client";
import { useState, useMemo } from "react";
import React from "react";

interface Listing {
  id: number;
  type: "sell" | "buy";
  bib: string | null;
  event: string;
  distance: string;
  date: string;
  price: number;
  seller: string;
  posted: string;
  reason: string;
  urgent: boolean;
  isNew: boolean;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #1a1a1a",
  outline: "none",
  background: "#fff",
  fontSize: 15,
  fontFamily: "'Syne', sans-serif",
  fontWeight: 500,
  padding: "12px 16px",
  color: "#1a1a1a",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 10,
  fontFamily: "'DM Mono', monospace",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "#888",
  marginBottom: 6,
};

const DIST_OPTIONS = [
  { key: "5K",  long: "5 Kilometer" },
  { key: "10K", long: "10 Kilometer" },
  { key: "HM",  long: "Halvmaraton" },
  { key: "M",   long: "Maraton" },
  { key: "OTHER", long: "Annet" },
];

function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" });
}

function DetailModal({ item, onClose }: { item: Listing; onClose: () => void }) {
  const [sent, setSent] = useState(false);
  const distLabel = DIST_OPTIONS.find(d => d.key === item.distance)?.long ?? item.distance;

  return (
    <div
      style={{ position:"fixed", inset:0, background:"rgba(26,26,26,0.55)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background:"#f4f1ed", border:"1px solid #1a1a1a", maxWidth:560, width:"100%", maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ padding:"20px 28px", borderBottom:"1px solid #1a1a1a", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontSize:18, fontWeight:800, letterSpacing:"-0.02em", textTransform:"uppercase", fontFamily:"'Syne',sans-serif" }}>
            {item.type === "sell" ? "Selger startnummer" : "Søker startnummer"}
          </span>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:18, cursor:"pointer", color:"#888" }}>✕</button>
        </div>
        <div style={{ padding:28 }}>
          <div style={{ display:"flex", alignItems:"baseline", gap:16, marginBottom:20 }}>
            {item.bib
              ? <span style={{ fontSize:56, fontWeight:800, letterSpacing:"-0.04em", lineHeight:1, fontFamily:"'Syne',sans-serif" }}>#{item.bib}</span>
              : <span style={{ fontSize:18, fontFamily:"'DM Mono',monospace", color:"#888", fontWeight:500 }}>Søker plass</span>
            }
            <div>
              <div style={{ fontSize:28, fontWeight:700, letterSpacing:"-0.02em" }}>{item.price} kr</div>
              <div style={{ fontSize:10, fontFamily:"'DM Mono',monospace", color:"#aaa", letterSpacing:"0.08em" }}>
                {item.type === "sell" ? "fast pris" : "maks budsjett"}
              </div>
            </div>
          </div>
          <div className="cpn-stat-grid" style={{ gridTemplateColumns:"repeat(2,1fr)", marginBottom:20 }}>
            <div className="cpn-stat"><div className="cpn-stat-label">Løp</div><div className="cpn-stat-value" style={{ fontSize:15 }}>{item.event}</div></div>
            <div className="cpn-stat"><div className="cpn-stat-label">Distanse</div><div className="cpn-stat-value" style={{ fontSize:15 }}>{distLabel}</div></div>
            <div className="cpn-stat"><div className="cpn-stat-label">Dato</div><div className="cpn-stat-value" style={{ fontSize:15 }}>{formatDisplayDate(item.date)}</div></div>
            <div className="cpn-stat"><div className="cpn-stat-label">Annonsert av</div><div className="cpn-stat-value" style={{ fontSize:15 }}>{item.seller}</div></div>
          </div>
          {item.reason && (
            <div style={{ fontSize:13, fontFamily:"'DM Mono',monospace", color:"#555", lineHeight:1.65, marginBottom:20, padding:"14px 16px", border:"1px solid #e0dcd8", background:"#fff" }}>
              «{item.reason}»
            </div>
          )}
          <button
            onClick={() => setSent(true)}
            style={{ width:"100%", padding:16, background:"#1a1a1a", color:"#f4f1ed", border:"1px solid #1a1a1a", fontSize:12, fontFamily:"'DM Mono',monospace", letterSpacing:"0.14em", textTransform:"uppercase", cursor:"pointer", marginBottom:10 }}
          >
            {sent ? `✓ Melding sendt — ${item.seller} kontakter deg` : `Kontakt ${item.seller} →`}
          </button>
          <button
            onClick={onClose}
            style={{ width:"100%", padding:14, background:"transparent", color:"#1a1a1a", border:"1px solid #1a1a1a", fontSize:11, fontFamily:"'DM Mono',monospace", letterSpacing:"0.14em", textTransform:"uppercase", cursor:"pointer" }}
          >
            Lukk
          </button>
        </div>
      </div>
    </div>
  );
}

interface FormState {
  type: "sell" | "buy";
  event: string;
  distance: string;
  date: string;
  price: string;
  bib: string;
  voucher: string;
  contact: string;
  reason: string;
}

function NewListingModal({ onClose, onAdd }: { onClose: () => void; onAdd: (l: Listing) => void }) {
  const [form, setForm] = useState<FormState>({
    type: "sell", event: "", distance: "HM", date: "", price: "", bib: "", voucher: "", contact: "", reason: "",
  });

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function submit() {
    if (!form.event.trim() || !form.price) return;
    // I produksjon: POST til /api/listings med form-data inkl. kryptert voucher
    onAdd({
      id: Date.now(),
      type: form.type,
      bib: form.bib || null,
      event: form.event,
      distance: form.distance,
      date: form.date,
      price: Number(form.price),
      seller: form.contact || "anonym",
      posted: "Akkurat nå",
      reason: form.reason,
      urgent: false,
      isNew: true,
    });
    onClose();
  }

  return (
    <div
      style={{ position:"fixed", inset:0, background:"rgba(26,26,26,0.55)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background:"#f4f1ed", border:"1px solid #1a1a1a", maxWidth:560, width:"100%", maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ padding:"20px 28px", borderBottom:"1px solid #1a1a1a", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontSize:18, fontWeight:800, letterSpacing:"-0.02em", textTransform:"uppercase", fontFamily:"'Syne',sans-serif" }}>Ny annonse</span>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:18, cursor:"pointer", color:"#888" }}>✕</button>
        </div>
        <div style={{ padding:28 }}>

          {/* Innlogging-banner hvis ikke autentisert */}
          <div style={{ marginBottom:20, padding:"12px 14px", border:"1px solid #e0dcd8", background:"#fff", fontSize:12, fontFamily:"'DM Mono',monospace", color:"#555", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
            <span>Logg inn med BankID for å selge startnummer.</span>
            <button style={{ padding:"6px 14px", background:"#1a1a1a", color:"#f4f1ed", border:"none", fontSize:10, fontFamily:"'DM Mono',monospace", letterSpacing:"0.12em", textTransform:"uppercase", cursor:"pointer" }}>
              BankID →
            </button>
          </div>

          <div style={{ marginBottom:18 }}>
            <span style={labelStyle}>Type annonse</span>
            <div className="cpn-tabs" style={{ borderBottom:"none" }}>
              {(["sell", "buy"] as const).map(t => (
                <button key={t} className={`cpn-tab${form.type === t ? " active" : ""}`} style={{ flex:1 }} onClick={() => set("type", t)}>
                  {t === "sell" ? "Selger startnummer" : "Søker startnummer"}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom:18 }}>
            <label style={labelStyle}>Løp / arrangement</label>
            <input style={inputStyle} placeholder="f.eks. Oslo Maraton 2025" value={form.event} onChange={e => set("event", e.target.value)} />
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:18 }}>
            <div>
              <label style={labelStyle}>Distanse</label>
              <select style={{ ...inputStyle, fontSize:14 }} value={form.distance} onChange={e => set("distance", e.target.value)}>
                {DIST_OPTIONS.map(d => <option key={d.key} value={d.key}>{d.long}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Dato på løpet</label>
              <input style={inputStyle} type="date" value={form.date} onChange={e => set("date", e.target.value)} />
            </div>
          </div>

          {form.type === "sell" && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:18 }}>
              <div>
                <label style={labelStyle}>Startnummer</label>
                <input style={inputStyle} placeholder="f.eks. 4217" value={form.bib} onChange={e => set("bib", e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Pris (kr)</label>
                <input style={inputStyle} placeholder="500" type="number" value={form.price} onChange={e => set("price", e.target.value)} />
              </div>
            </div>
          )}

          {form.type === "buy" && (
            <div style={{ marginBottom:18 }}>
              <label style={labelStyle}>Maks pris (kr)</label>
              <input style={inputStyle} placeholder="500" type="number" value={form.price} onChange={e => set("price", e.target.value)} />
            </div>
          )}

          {form.type === "sell" && (
            <div style={{ marginBottom:18 }}>
              <label style={labelStyle}>Voucher / overføringskode</label>
              <input
                style={inputStyle}
                placeholder="Koden fra arrangør (lagres kryptert)"
                value={form.voucher}
                onChange={e => set("voucher", e.target.value)}
                type="password"
                autoComplete="off"
              />
              <div style={{ marginTop:6, fontSize:10, fontFamily:"'DM Mono',monospace", color:"#aaa", letterSpacing:"0.06em" }}>
                Krypteres med AES-256-GCM — kun synlig for kjøper etter betaling er bekreftet.
              </div>
            </div>
          )}

          <div style={{ marginBottom:18 }}>
            <label style={labelStyle}>Kontakt / brukernavn</label>
            <input style={inputStyle} placeholder="Ditt navn eller e-post" value={form.contact} onChange={e => set("contact", e.target.value)} />
          </div>

          <div style={{ marginBottom:22 }}>
            <label style={labelStyle}>Beskrivelse</label>
            <textarea
              style={{ ...inputStyle, minHeight:80, resize:"vertical", fontFamily:"'DM Mono',monospace", fontSize:13 }}
              placeholder="Grunn til salg / søk, andre detaljer…"
              value={form.reason}
              onChange={e => set("reason", e.target.value)}
            />
          </div>

          <button
            onClick={submit}
            style={{ width:"100%", padding:16, background:"#1a1a1a", color:"#f4f1ed", border:"1px solid #1a1a1a", fontSize:12, fontFamily:"'DM Mono',monospace", letterSpacing:"0.14em", textTransform:"uppercase", cursor:"pointer", marginBottom:10 }}
          >
            Publiser annonse →
          </button>
          <button
            onClick={onClose}
            style={{ width:"100%", padding:14, background:"transparent", color:"#1a1a1a", border:"1px solid #1a1a1a", fontSize:11, fontFamily:"'DM Mono',monospace", letterSpacing:"0.14em", textTransform:"uppercase", cursor:"pointer" }}
          >
            Avbryt
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StartnummerMarked() {
  const [typeTab, setTypeTab] = useState("ALL");
  const [q, setQ] = useState("");
  const [listings, setListings] = useState<Listing[]>([]);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [showNew, setShowNew] = useState(false);

  // I produksjon: hent fra /api/listings
  // useEffect(() => { fetch("/api/listings").then(r => r.json()).then(setListings); }, []);

  const filtered = useMemo(() => listings.filter(l => {
    if (typeTab === "SELL" && l.type !== "sell") return false;
    if (typeTab === "BUY"  && l.type !== "buy")  return false;
    if (q.trim().length >= 2) {
      const s = q.toLowerCase();
      return l.event.toLowerCase().includes(s) || (l.bib && l.bib.includes(s));
    }
    return true;
  }), [listings, typeTab, q]);

  const sells    = listings.filter(l => l.type === "sell");
  const buys     = listings.filter(l => l.type === "buy");
  const avgPrice = sells.length ? Math.round(sells.reduce((s, l) => s + l.price, 0) / sells.length) : 0;
  const events   = new Set(listings.map(l => l.event)).size;

  return (
    <div className="cpn-root">

      <header className="cpn-header">
        <span className="cpn-logo">Startnummer — Marked</span>
        <span className="cpn-header-right">{new Date().getFullYear()} · Kjøp & Salg</span>
      </header>

      <div className="cpn-hero">
        <div>
          <div className="cpn-hero-eyebrow">Markedsplass / Startnummer</div>
          <h1 className="cpn-hero-title">Kjøp & Salg</h1>
        </div>
        <p className="cpn-hero-desc">
          Selg startnummeret ditt videre, eller finn en plass i et løp som er fullt.
          Alle kategorier og distanser — på ett sted.
        </p>
      </div>

      <div className="cpn-stats-section" style={{ padding:0, borderBottom:"1px solid #1a1a1a" }}>
        <div className="cpn-stat-grid" style={{ gridTemplateColumns:"repeat(4,1fr)", border:"none" }}>
          <div className="cpn-stat"><div className="cpn-stat-label">Til salgs</div><div className="cpn-stat-value">{sells.length}</div><div className="cpn-stat-hint">aktive annonser</div></div>
          <div className="cpn-stat"><div className="cpn-stat-label">Søker plass</div><div className="cpn-stat-value">{buys.length}</div><div className="cpn-stat-hint">kjøpere venter</div></div>
          <div className="cpn-stat"><div className="cpn-stat-label">Løp representert</div><div className="cpn-stat-value">{events}</div><div className="cpn-stat-hint">unike arrangementer</div></div>
          <div className="cpn-stat accent"><div className="cpn-stat-label">Snittspris</div><div className="cpn-stat-value">{avgPrice > 0 ? `${avgPrice} kr` : "—"}</div><div className="cpn-stat-hint">for salgsannonser</div></div>
        </div>
      </div>

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom:"1px solid #1a1a1a", background:"#fff" }}>
        <div className="cpn-tabs" style={{ borderBottom:"none", flex:1 }}>
          {(["ALL", "SELL", "BUY"] as const).map(k => {
            const label = k === "ALL" ? "Alle" : k === "SELL" ? "Selger" : "Søker";
            return (
              <button key={k} className={`cpn-tab${typeTab === k ? " active" : ""}`} onClick={() => setTypeTab(k)}>{label}</button>
            );
          })}
        </div>
        <button
          onClick={() => setShowNew(true)}
          style={{ margin:"0 24px", padding:"10px 20px", background:"#1a1a1a", color:"#f4f1ed", border:"1px solid #1a1a1a", fontSize:11, fontFamily:"'DM Mono',monospace", letterSpacing:"0.14em", textTransform:"uppercase", cursor:"pointer", whiteSpace:"nowrap" }}
        >
          + Ny annonse
        </button>
      </div>

      <div className="cpn-search-wrap">
        <div className="cpn-search-label">Søk annonser</div>
        <div className="cpn-search-row">
          <input className="cpn-search-input" placeholder="Løpsnavn eller startnummer…" value={q} onChange={e => setQ(e.target.value)} />
          {q && <button className="cpn-search-clear" onClick={() => setQ("")}>✕ tøm</button>}
        </div>
        <div className="cpn-search-status">{filtered.length} annonse{filtered.length !== 1 ? "r" : ""}</div>
      </div>

      <div style={{ padding:"32px 48px 64px" }}>
        <div className="cpn-section-label" style={{ marginBottom:16 }}>Annonser</div>

        {filtered.length === 0 && (
          <div className="cpn-no-results">
            {listings.length === 0
              ? "Ingen annonser ennå — vær den første til å legge ut!"
              : "Ingen annonser matcher søket."}
          </div>
        )}

        {filtered.length > 0 && (
          <div className="cpn-pr-table">
            <div className="cpn-pr-head" style={{ gridTemplateColumns:"80px 1fr 160px 110px 80px" }}>
              <div className="cpn-pr-th">Nr.</div>
              <div className="cpn-pr-th">Løp</div>
              <div className="cpn-pr-th">Distanse · Dato</div>
              <div className="cpn-pr-th">Pris</div>
              <div className="cpn-pr-th">Type</div>
            </div>

            {filtered.map(item => (
              <button key={item.id} className="cpn-pr-row" style={{ gridTemplateColumns:"80px 1fr 160px 110px 80px" }} onClick={() => setSelected(item)}>
                <div className="cpn-pr-td name" style={{ fontSize:22, letterSpacing:"-0.03em" }}>
                  {item.bib ? `#${item.bib}` : "—"}
                </div>
                <div className="cpn-pr-td">
                  <span style={{ fontWeight:700, fontFamily:"'Syne',sans-serif", fontSize:14 }}>{item.event}</span>
                  <span className="cpn-td-sub" style={{ display:"block", marginTop:3 }}>{item.seller} · {item.posted}</span>
                  {item.reason && (
                    <span style={{ display:"block", marginTop:4, fontSize:11, fontFamily:"'DM Mono',monospace", color:"#888", fontStyle:"italic" }}>
                      «{item.reason.length > 70 ? item.reason.slice(0, 70) + "…" : item.reason}»
                    </span>
                  )}
                </div>
                <div className="cpn-pr-td">
                  <span style={{ fontWeight:600 }}>{DIST_OPTIONS.find(d => d.key === item.distance)?.long ?? item.distance}</span>
                  <span className="cpn-td-sub" style={{ display:"block", marginTop:2 }}>{formatDisplayDate(item.date)}</span>
                </div>
                <div className="cpn-pr-td">
                  <span style={{ fontSize:18, fontWeight:700, letterSpacing:"-0.02em" }}>{item.price} kr</span>
                  <span className="cpn-td-sub" style={{ display:"block", marginTop:2 }}>{item.type === "sell" ? "fast pris" : "maks budsjett"}</span>
                </div>
                <div className="cpn-pr-td" style={{ display:"flex", flexDirection:"column", gap:4, alignItems:"flex-start" }}>
                  <span className="cpn-hit-badge">{item.type === "sell" ? "Selger" : "Søker"}</span>
                  {item.urgent && <span className="cpn-hit-badge" style={{ borderColor:"#b00", color:"#b00" }}>Haster</span>}
                  {item.isNew  && <span className="cpn-hit-badge" style={{ background:"#2d7d46", color:"#fff", borderColor:"#2d7d46" }}>Ny</span>}
                </div>
              </button>
            ))}

            <div className="cpn-table-foot">
              Viser {filtered.length} annonse{filtered.length !== 1 ? "r" : ""} · Startnummer-markedet
            </div>
          </div>
        )}
      </div>

      {selected && <DetailModal item={selected} onClose={() => setSelected(null)} />}
      {showNew   && <NewListingModal onClose={() => setShowNew(false)} onAdd={l => setListings(p => [l, ...p])} />}
    </div>
  );
}