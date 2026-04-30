"use client";
import React, { useMemo, useState } from "react";

interface Listing {
  id: string;
  type: "sell" | "buy";
  bib: string | null;
  event: string;
  distance: string;
  date: string | null;
  price: number;
  seller: string;
  seller_avatar?: string | null;
  seller_has_activity?: boolean;
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
  { key: "5K", long: "5 Kilometer" },
  { key: "10K", long: "10 Kilometer" },
  { key: "HM", long: "Halvmaraton" },
  { key: "M", long: "Maraton" },
  { key: "OTHER", long: "Annet" },
];

type MeUser =
  | null
  | {
      id: string;
      stravaAthleteId: string;
      displayName: string | null;
      avatarUrl: string | null;
    };

function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function SellerAvatar({
  name,
  avatarUrl,
  size = 36,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  const [imgError, setImgError] = useState(false);
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setImgError(true)}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          border: "1.5px solid #e0dcd8",
          flexShrink: 0,
          display: "block",
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "#1a1a1a",
        color: "#f4f1ed",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.36,
        fontFamily: "'Syne', sans-serif",
        fontWeight: 700,
        flexShrink: 0,
        letterSpacing: "-0.02em",
      }}
    >
      {initials || "?"}
    </div>
  );
}

function StravaVerifiedBadge({ active }: { active: boolean }) {
  if (active) {
    return (
      <span
        title="Aktiv på Strava"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 10,
          fontFamily: "'DM Mono', monospace",
          color: "#2d7d46",
          background: "#eaf5ee",
          border: "1px solid #b6dfc4",
          borderRadius: 2,
          padding: "2px 6px",
          letterSpacing: "0.06em",
          whiteSpace: "nowrap",
        }}
      >
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
          <circle cx="5" cy="5" r="5" fill="#2d7d46" />
          <path d="M2.5 5l2 2 3-3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Strava-verifisert
      </span>
    );
  }
  return (
    <span
      title="Ingen offentlige aktiviteter"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        fontFamily: "'DM Mono', monospace",
        color: "#aaa",
        letterSpacing: "0.06em",
        whiteSpace: "nowrap",
      }}
    >
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
        <circle cx="5" cy="5" r="4.5" stroke="#ccc" />
        <path d="M5 3v2.5" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="5" cy="7" r="0.7" fill="#ccc" />
      </svg>
      Ikke verifisert
    </span>
  );
}

function DetailModal({ item, onClose }: { item: Listing; onClose: () => void }) {
  const [sent, setSent] = useState(false);
  const distLabel =
    DIST_OPTIONS.find((d) => d.key === item.distance)?.long ?? item.distance;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26,26,26,0.6)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        backdropFilter: "blur(2px)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#f4f1ed",
          border: "1px solid #1a1a1a",
          maxWidth: 560,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 28px",
            borderBottom: "1px solid #1a1a1a",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              className="cpn-hit-badge"
              style={
                item.type === "sell"
                  ? {}
                  : { background: "#1a1a1a", color: "#f4f1ed", borderColor: "#1a1a1a" }
              }
            >
              {item.type === "sell" ? "Selger" : "Søker"}
            </span>
            <span
              style={{
                fontSize: 16,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
                fontFamily: "'Syne',sans-serif",
              }}
            >
              {item.type === "sell" ? "Selger startnummer" : "Søker startnummer"}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 18,
              cursor: "pointer",
              color: "#888",
              lineHeight: 1,
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 28 }}>
          {/* Seller card */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "16px 18px",
              background: "#fff",
              border: "1px solid #e0dcd8",
              marginBottom: 24,
            }}
          >
            <SellerAvatar name={item.seller} avatarUrl={item.seller_avatar} size={52} />
            <div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  fontFamily: "'Syne', sans-serif",
                  letterSpacing: "-0.01em",
                  marginBottom: 5,
                }}
              >
                {item.seller}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <StravaVerifiedBadge active={!!item.seller_has_activity} />
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "'DM Mono', monospace",
                    color: "#bbb",
                    letterSpacing: "0.06em",
                  }}
                >
                  Publisert {item.posted}
                </span>
              </div>
            </div>
          </div>

          {/* Price + bib */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 20,
              marginBottom: 22,
              padding: "0 0 22px",
              borderBottom: "1px solid #e0dcd8",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: "'DM Mono', monospace",
                  color: "#aaa",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                {item.type === "sell" ? "Fast pris" : "Maks budsjett"}
              </div>
              <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1, fontFamily: "'Syne',sans-serif" }}>
                {item.price} <span style={{ fontSize: 20, fontWeight: 500, color: "#888" }}>kr</span>
              </div>
            </div>
            {item.bib && (
              <div
                style={{
                  marginLeft: "auto",
                  textAlign: "right",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontFamily: "'DM Mono', monospace",
                    color: "#aaa",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  Startnummer
                </div>
                <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1, fontFamily: "'Syne',sans-serif" }}>
                  #{item.bib}
                </div>
              </div>
            )}
          </div>

          {/* Stats */}
          <div
            className="cpn-stat-grid"
            style={{ gridTemplateColumns: "repeat(2,1fr)", marginBottom: 20 }}
          >
            <div className="cpn-stat">
              <div className="cpn-stat-label">Løp</div>
              <div className="cpn-stat-value" style={{ fontSize: 14 }}>
                {item.event}
              </div>
            </div>
            <div className="cpn-stat">
              <div className="cpn-stat-label">Distanse</div>
              <div className="cpn-stat-value" style={{ fontSize: 14 }}>
                {distLabel}
              </div>
            </div>
            <div className="cpn-stat">
              <div className="cpn-stat-label">Dato</div>
              <div className="cpn-stat-value" style={{ fontSize: 14 }}>
                {formatDisplayDate(item.date)}
              </div>
            </div>
            {item.urgent && (
              <div className="cpn-stat">
                <div className="cpn-stat-label">Status</div>
                <div className="cpn-stat-value" style={{ fontSize: 13, color: "#b00" }}>
                  ⚡ Haster
                </div>
              </div>
            )}
          </div>

          {item.reason && (
            <div
              style={{
                fontSize: 13,
                fontFamily: "'DM Mono',monospace",
                color: "#555",
                lineHeight: 1.7,
                marginBottom: 24,
                padding: "14px 18px",
                border: "1px solid #e0dcd8",
                background: "#fff",
                borderLeft: "3px solid #1a1a1a",
              }}
            >
              «{item.reason}»
            </div>
          )}

          <button
            onClick={() => setSent(true)}
            style={{
              width: "100%",
              padding: "15px 20px",
              background: sent ? "#2d7d46" : "#1a1a1a",
              color: "#f4f1ed",
              border: `1px solid ${sent ? "#2d7d46" : "#1a1a1a"}`,
              fontSize: 12,
              fontFamily: "'DM Mono',monospace",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              cursor: "pointer",
              marginBottom: 10,
              transition: "background 0.2s, border-color 0.2s",
            }}
          >
            {sent
              ? `✓ Melding sendt — ${item.seller} kontakter deg`
              : `Kontakt ${item.seller} →`}
          </button>

          <button
            onClick={onClose}
            style={{
              width: "100%",
              padding: 13,
              background: "transparent",
              color: "#1a1a1a",
              border: "1px solid #1a1a1a",
              fontSize: 11,
              fontFamily: "'DM Mono',monospace",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
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

function NewListingModal({
  me,
  onClose,
  onCreated,
  warnLogin,
}: {
  me: MeUser;
  onClose: () => void;
  onCreated: (created: Listing) => void;
  warnLogin: () => void;
}) {
  const [form, setForm] = useState<FormState>({
    type: "sell",
    event: "",
    distance: "HM",
    date: "",
    price: "",
    bib: "",
    voucher: "",
    contact: "",
    reason: "",
  });

  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    if (!me) return warnLogin();
    if (!form.event.trim() || !form.price) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/startnummer/listings/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: form.type,
          event: form.event,
          distance: form.distance,
          date: form.date || undefined,
          price: Number(form.price),
          bib: form.bib || null,
          contact: form.contact || (me.displayName ?? "Strava"),
          reason: form.reason,
          urgent: false,
        }),
      });

      if (res.status === 401) return warnLogin();
      if (!res.ok) return;

      const created = (await res.json()) as Listing;
      onCreated(created);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26,26,26,0.6)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        backdropFilter: "blur(2px)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#f4f1ed",
          border: "1px solid #1a1a1a",
          maxWidth: 560,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            padding: "20px 28px",
            borderBottom: "1px solid #1a1a1a",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              fontFamily: "'Syne',sans-serif",
            }}
          >
            Ny annonse
          </span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#888" }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 28 }}>
          {me && (
            <div
              style={{
                marginBottom: 22,
                padding: "12px 16px",
                background: "#fff",
                border: "1px solid #e0dcd8",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <SellerAvatar name={me.displayName ?? "?"} avatarUrl={me.avatarUrl} size={36} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "'Syne', sans-serif" }}>
                  {me.displayName ?? "Strava-bruker"}
                </div>
                <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#888", letterSpacing: "0.06em" }}>
                  Publiseres som deg
                </div>
              </div>
            </div>
          )}

          {!me && (
            <div
              style={{
                marginBottom: 20,
                padding: "12px 14px",
                border: "1px solid #e0dcd8",
                background: "#fff",
                fontSize: 12,
                fontFamily: "'DM Mono',monospace",
                color: "#555",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div>Logg inn for å publisere annonse.</div>
              <a href="/api/auth/strava/start" className="strava-login-btn">
                Logg inn med Strava
              </a>
            </div>
          )}

          <div style={{ marginBottom: 18 }}>
            <span style={labelStyle}>Type annonse</span>
            <div className="cpn-tabs" style={{ borderBottom: "none" }}>
              {(["sell", "buy"] as const).map((t) => (
                <button
                  key={t}
                  className={`cpn-tab${form.type === t ? " active" : ""}`}
                  style={{ flex: 1 }}
                  onClick={() => set("type", t)}
                >
                  {t === "sell" ? "Selger startnummer" : "Søker startnummer"}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Løp / arrangement</label>
            <input
              style={inputStyle}
              placeholder="f.eks. Oslo Maraton 2025"
              value={form.event}
              onChange={(e) => set("event", e.target.value)}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
            <div>
              <label style={labelStyle}>Distanse</label>
              <select
                style={{ ...inputStyle, fontSize: 14 }}
                value={form.distance}
                onChange={(e) => set("distance", e.target.value)}
              >
                {DIST_OPTIONS.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.long}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Dato på løpet</label>
              <input style={inputStyle} type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
            </div>
          </div>

          {form.type === "sell" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
              <div>
                <label style={labelStyle}>Startnummer</label>
                <input
                  style={inputStyle}
                  placeholder="f.eks. 4217"
                  value={form.bib}
                  onChange={(e) => set("bib", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle}>Pris (kr)</label>
                <input
                  style={inputStyle}
                  placeholder="500"
                  type="number"
                  value={form.price}
                  onChange={(e) => set("price", e.target.value)}
                />
              </div>
            </div>
          )}

          {form.type === "buy" && (
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Maks pris (kr)</label>
              <input
                style={inputStyle}
                placeholder="500"
                type="number"
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
              />
            </div>
          )}

          {form.type === "sell" && (
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Voucher / overføringskode</label>
              <input
                style={inputStyle}
                placeholder="Koden fra arrangør (ikke lagret enda)"
                value={form.voucher}
                onChange={(e) => set("voucher", e.target.value)}
                type="password"
                autoComplete="off"
              />
              <div
                style={{
                  marginTop: 6,
                  fontSize: 10,
                  fontFamily: "'DM Mono',monospace",
                  color: "#aaa",
                  letterSpacing: "0.06em",
                }}
              >
                Lagres kryptert i neste versjon — kun annonsen lagres nå.
              </div>
            </div>
          )}

          <div style={{ marginBottom: 22 }}>
            <label style={labelStyle}>Beskrivelse</label>
            <textarea
              style={{
                ...inputStyle,
                minHeight: 80,
                resize: "vertical",
                fontFamily: "'DM Mono',monospace",
                fontSize: 13,
              }}
              placeholder="Grunn til salg / søk, andre detaljer…"
              value={form.reason}
              onChange={(e) => set("reason", e.target.value)}
            />
          </div>

          <button
            onClick={submit}
            disabled={!me || submitting}
            style={{
              width: "100%",
              padding: 16,
              background: me ? "#1a1a1a" : "#777",
              color: "#f4f1ed",
              border: "1px solid #1a1a1a",
              fontSize: 12,
              fontFamily: "'DM Mono',monospace",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              cursor: me ? "pointer" : "not-allowed",
              marginBottom: 10,
              opacity: submitting ? 0.8 : 1,
            }}
          >
            {me ? (submitting ? "Publiserer…" : "Publiser annonse →") : "Logg inn med Strava for å publisere"}
          </button>

          <button
            onClick={onClose}
            style={{
              width: "100%",
              padding: 14,
              background: "transparent",
              color: "#1a1a1a",
              border: "1px solid #1a1a1a",
              fontSize: 11,
              fontFamily: "'DM Mono',monospace",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
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

  const [me, setMe] = useState<MeUser>(null);
  const [meLoading, setMeLoading] = useState(true);

  const [toast, setToast] = useState<string | null>(null);

  function warnLogin() {
    setToast("Du må logge inn med Strava for å legge ut annonse.");
    window.setTimeout(() => setToast(null), 2500);
  }

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setMeLoading(true);
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) {
          if (!cancelled) setMe(null);
          return;
        }
        const data = await res.json();
        if (!cancelled) setMe(data.user ?? null);
      } finally {
        if (!cancelled) setMeLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/startnummer/listings", { credentials: "include" });
      const data = await res.json();
      if (!cancelled) setListings(Array.isArray(data) ? data : []);
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    return listings.filter((l) => {
      if (typeTab === "SELL" && l.type !== "sell") return false;
      if (typeTab === "BUY" && l.type !== "buy") return false;
      if (q.trim().length >= 2) {
        const s = q.toLowerCase();
        return l.event.toLowerCase().includes(s) || (l.bib && l.bib.includes(s));
      }
      return true;
    });
  }, [listings, typeTab, q]);

  const sells = listings.filter((l) => l.type === "sell");
  const buys = listings.filter((l) => l.type === "buy");
  const avgPrice = sells.length
    ? Math.round(sells.reduce((s, l) => s + l.price, 0) / sells.length)
    : 0;
  const events = new Set(listings.map((l) => l.event)).size;

  return (
    <div className="cpn-root">
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 90,
            right: 20,
            zIndex: 99999,
            padding: "10px 16px",
            background: "#1a1a1a",
            color: "#f4f1ed",
            border: "1px solid #1a1a1a",
            fontSize: 12,
            fontFamily: "'DM Mono',monospace",
            letterSpacing: "0.06em",
            maxWidth: 340,
            boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
          }}
        >
          {toast}
        </div>
      )}

      <header className="cpn-header">
        <span className="cpn-logo">Startnummer — Marked</span>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {me ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <SellerAvatar name={me.displayName ?? "?"} avatarUrl={me.avatarUrl} size={28} />
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "'DM Mono', monospace",
                  color: "#888",
                  letterSpacing: "0.06em",
                }}
              >
                {me.displayName}
              </span>
            </div>
          ) : (
            <a
              href="/api/auth/strava/start"
              style={{
                fontSize: 10,
                fontFamily: "'DM Mono', monospace",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#888",
                textDecoration: "none",
                border: "1px solid #e0dcd8",
                padding: "5px 10px",
              }}
            >
              Logg inn med Strava
            </a>
          )}
          <span className="cpn-header-right">{new Date().getFullYear()} · Kjøp & Salg</span>
        </div>
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

      <div className="cpn-stats-section" style={{ padding: 0, borderBottom: "1px solid #1a1a1a" }}>
        <div className="cpn-stat-grid" style={{ gridTemplateColumns: "repeat(4,1fr)", border: "none" }}>
          <div className="cpn-stat">
            <div className="cpn-stat-label">Til salgs</div>
            <div className="cpn-stat-value">{sells.length}</div>
            <div className="cpn-stat-hint">aktive annonser</div>
          </div>
          <div className="cpn-stat">
            <div className="cpn-stat-label">Søker plass</div>
            <div className="cpn-stat-value">{buys.length}</div>
            <div className="cpn-stat-hint">kjøpere venter</div>
          </div>
          <div className="cpn-stat">
            <div className="cpn-stat-label">Løp representert</div>
            <div className="cpn-stat-value">{events}</div>
            <div className="cpn-stat-hint">unike arrangementer</div>
          </div>
          <div className="cpn-stat accent">
            <div className="cpn-stat-label">Snittspris</div>
            <div className="cpn-stat-value">{avgPrice > 0 ? `${avgPrice} kr` : "—"}</div>
            <div className="cpn-stat-hint">for salgsannonser</div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #1a1a1a",
          background: "#fff",
        }}
      >
        <div className="cpn-tabs" style={{ borderBottom: "none", flex: 1 }}>
          {(["ALL", "SELL", "BUY"] as const).map((k) => {
            const label = k === "ALL" ? "Alle" : k === "SELL" ? "Selger" : "Søker";
            const count = k === "ALL" ? listings.length : k === "SELL" ? sells.length : buys.length;
            return (
              <button
                key={k}
                className={`cpn-tab${typeTab === k ? " active" : ""}`}
                onClick={() => setTypeTab(k)}
              >
                {label}
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 10,
                    fontFamily: "'DM Mono', monospace",
                    opacity: 0.5,
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => {
            if (meLoading) return;
            if (!me) return warnLogin();
            setShowNew(true);
          }}
          style={{
            margin: "0 24px",
            padding: "10px 20px",
            background: me ? "#1a1a1a" : "#777",
            color: "#f4f1ed",
            border: "1px solid #1a1a1a",
            fontSize: 11,
            fontFamily: "'DM Mono',monospace",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            cursor: me ? "pointer" : "not-allowed",
            whiteSpace: "nowrap",
            opacity: meLoading ? 0.7 : 1,
          }}
          aria-disabled={!me}
        >
          + Ny annonse
        </button>
      </div>

      <div className="cpn-search-wrap">
        <div className="cpn-search-label">Søk annonser</div>
        <div className="cpn-search-row">
          <input
            className="cpn-search-input"
            placeholder="Løpsnavn eller startnummer…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button className="cpn-search-clear" onClick={() => setQ("")}>
              ✕ tøm
            </button>
          )}
        </div>
        <div className="cpn-search-status">
          {filtered.length} annonse{filtered.length !== 1 ? "r" : ""}
        </div>
      </div>

      <div style={{ padding: "32px 48px 64px" }}>
        <div className="cpn-section-label" style={{ marginBottom: 16 }}>
          Annonser
        </div>

        {filtered.length === 0 && (
          <div className="cpn-no-results">
            {listings.length === 0
              ? "Ingen annonser ennå — vær den første til å legge ut!"
              : "Ingen annonser matcher søket."}
          </div>
        )}

        {filtered.length > 0 && (
          <div className="cpn-pr-table">
            {/* Table header */}
            <div
              className="cpn-pr-head"
              style={{ gridTemplateColumns: "200px 1fr 150px 110px 100px" }}
            >
              <div className="cpn-pr-th">Selger</div>
              <div className="cpn-pr-th">Løp</div>
              <div className="cpn-pr-th">Distanse · Dato</div>
              <div className="cpn-pr-th">Pris</div>
              <div className="cpn-pr-th">Type</div>
            </div>

            {filtered.map((item) => (
              <button
                key={item.id}
                className="cpn-pr-row"
                style={{ gridTemplateColumns: "200px 1fr 150px 110px 100px" }}
                onClick={() => setSelected(item)}
              >
                {/* Seller column */}
                <div className="cpn-pr-td" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <SellerAvatar name={item.seller} avatarUrl={item.seller_avatar} size={38} />
                    {item.seller_has_activity && (
                      <span
                        title="Strava-verifisert"
                        style={{
                          position: "absolute",
                          bottom: -1,
                          right: -1,
                          width: 14,
                          height: 14,
                          borderRadius: "50%",
                          background: "#2d7d46",
                          border: "2px solid #f4f1ed",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
                          <path
                            d="M1.5 4l2 2 3-3"
                            stroke="#fff"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontFamily: "'Syne', sans-serif",
                        fontSize: 13,
                        letterSpacing: "-0.01em",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {item.seller}
                    </div>
                    <div style={{ marginTop: 3 }}>
                      {item.seller_has_activity ? (
                        <span
                          style={{
                            fontSize: 9,
                            fontFamily: "'DM Mono', monospace",
                            color: "#2d7d46",
                            letterSpacing: "0.04em",
                          }}
                        >
                          ✓ Strava-verifisert
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 9,
                            fontFamily: "'DM Mono', monospace",
                            color: "#bbb",
                            letterSpacing: "0.04em",
                          }}
                        >
                          Ikke verifisert
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Event column */}
                <div className="cpn-pr-td">
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontFamily: "'Syne',sans-serif", fontSize: 14 }}>
                      {item.event}
                    </span>
                    {item.bib && (
                      <span
                        style={{
                          fontSize: 12,
                          fontFamily: "'DM Mono', monospace",
                          color: "#888",
                          letterSpacing: "0.04em",
                        }}
                      >
                        #{item.bib}
                      </span>
                    )}
                  </div>
                  <span className="cpn-td-sub" style={{ display: "block", marginTop: 3 }}>
                    {item.posted}
                  </span>
                  {item.reason && (
                    <span
                      style={{
                        display: "block",
                        marginTop: 4,
                        fontSize: 11,
                        fontFamily: "'DM Mono',monospace",
                        color: "#888",
                        fontStyle: "italic",
                      }}
                    >
                      «{item.reason.length > 65 ? item.reason.slice(0, 65) + "…" : item.reason}»
                    </span>
                  )}
                </div>

                {/* Distance / date */}
                <div className="cpn-pr-td">
                  <span style={{ fontWeight: 600 }}>
                    {DIST_OPTIONS.find((d) => d.key === item.distance)?.long ?? item.distance}
                  </span>
                  <span className="cpn-td-sub" style={{ display: "block", marginTop: 2 }}>
                    {formatDisplayDate(item.date)}
                  </span>
                </div>

                {/* Price */}
                <div className="cpn-pr-td">
                  <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>
                    {item.price} kr
                  </span>
                  <span className="cpn-td-sub" style={{ display: "block", marginTop: 2 }}>
                    {item.type === "sell" ? "fast pris" : "maks budsjett"}
                  </span>
                </div>

                {/* Badges */}
                <div
                  className="cpn-pr-td"
                  style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}
                >
                  <span
                    className="cpn-hit-badge"
                    style={
                      item.type === "buy"
                        ? { background: "#1a1a1a", color: "#f4f1ed", borderColor: "#1a1a1a" }
                        : {}
                    }
                  >
                    {item.type === "sell" ? "Selger" : "Søker"}
                  </span>
                  {item.urgent && (
                    <span className="cpn-hit-badge" style={{ borderColor: "#b00", color: "#b00" }}>
                      Haster
                    </span>
                  )}
                  {item.isNew && (
                    <span
                      className="cpn-hit-badge"
                      style={{ background: "#2d7d46", color: "#fff", borderColor: "#2d7d46" }}
                    >
                      Ny
                    </span>
                  )}
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

      {showNew && (
        <NewListingModal
          me={me}
          warnLogin={warnLogin}
          onClose={() => setShowNew(false)}
          onCreated={(created) => setListings((p) => [created, ...p])}
        />
      )}
    </div>
  );
}