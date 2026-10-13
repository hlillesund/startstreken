"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import AthleteSearch from "@/components/AthleteSearch";
import { LogoMark } from "@/components/ui/Logo";
import CountUp from "@/components/ui/CountUp";
import { MAIN_DISTANCES, dateParts, distanceLabel, formatTime, initials } from "@/components/utovere/utils";
import { useRecentAthletes } from "@/lib/recent-athletes";
import running from "../../public/running1.jpg";

type Stats = { athletes: number; results: number; events: number; events_year: number; year: number };
type RecentEvent = { id: string; name: string; start_date: string | null; location: string | null; finishers: number; categories: string[] };
type Entry = { athlete_id: string; display_name: string; best_time_ms: number; rank: number; club?: string; event_name?: string };
type Boards = Record<string, { M: Entry[]; F: Entry[] }>;

const nf = new Intl.NumberFormat("nb-NO");

/** Splits text into words that rise in one after another. */
function Words({ text, offset = 0 }: { text: string; offset?: number }) {
  return (
    <>
      {text.split(" ").map((w, i, all) => (
        <React.Fragment key={i}>
          <span className="w" aria-hidden="true" style={{ "--i": i + offset } as React.CSSProperties}>{w}</span>
          {i < all.length - 1 ? " " : null}
        </React.Fragment>
      ))}
    </>
  );
}

const BIG: Record<string, string> = { "5K": "5K", "10K": "10K", HM: "21K", M: "42K" };

function useJson<T>(url: string, pick: (d: unknown) => T | null) {
  const [data, setData] = useState<T | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(url)
      .then((r) => r.json())
      .then((d) => alive && setData(pick(d)))
      .catch(() => {})
      .finally(() => alive && setDone(true));
    return () => {
      alive = false;
    };
    // pick is a stable inline selector
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return { data, done };
}

/* ── Top lists: one large card per distance ────────────── */
function DistCard({ dist, data, year, delay = 0 }: { dist: (typeof MAIN_DISTANCES)[number]; data?: { M: Entry[]; F: Entry[] }; year: number; delay?: number }) {
  const list = (g: "M" | "F", title: string) => (
    <div>
      <div className="ss-dist-list-title">{title}</div>
      {!data
        ? [0, 1, 2].map((i) => <div key={i} className="ss-skel" style={{ height: 18, margin: "14px 0" }} />)
        : data[g].length === 0
          ? <div className="ss-dist-time" style={{ paddingTop: 8 }}>Ingen resultater ennå</div>
          : data[g].slice(0, 3).map((e, i) => (
              <Link key={e.athlete_id} href={`/utovere?athleteId=${e.athlete_id}`} className={`ss-dist-row${i === 0 ? " is-first" : ""}`}>
                <span className="ss-dist-pos">{e.rank}</span>
                <span className="ss-dist-name">{e.display_name}</span>
                <span className="ss-dist-time">{formatTime(e.best_time_ms)}</span>
              </Link>
            ))}
    </div>
  );
  return (
    <article className="ss-dist-card ss-reveal" data-big={BIG[dist.key]} style={{ "--d": `${delay}ms` } as React.CSSProperties}>
      <div className="ss-dist-card-top">
        <div className="ss-tags">
          <span className="ss-tag">Topp 3</span>
          <span className="ss-tag">{year}</span>
        </div>
      </div>
      <div className="ss-dist-lists">
        {list("M", "Herrer")}
        {list("F", "Damer")}
      </div>
      <div className="ss-dist-foot">
        <div>
          <div className="ss-dist-title">{dist.label}</div>
          <div className="ss-dist-sub">Beste tid per løper i {year}</div>
        </div>
        <Link href={`/utovere/topp100?category=${dist.key}&year=${year}`} className="ss-arrow" aria-label={`Topp 100 ${dist.label.toLowerCase()}`}>
          <ArrowUpRight size={18} />
        </Link>
      </div>
    </article>
  );
}

/* ── Leaders of the year, rotating like a testimonial ──── */
function Leaders({ boards, year }: { boards: Boards | null; year: number }) {
  const items = MAIN_DISTANCES.flatMap((d) =>
    (["M", "F"] as const).flatMap((g) => {
      const e = boards?.[d.key]?.[g]?.[0];
      return e ? [{ d, g, e }] : [];
    })
  );
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || items.length < 2) return;
    const t = setInterval(() => setI((v) => (v + 1) % items.length), 6000);
    return () => clearInterval(t);
  }, [paused, items.length]);

  const cur = items[i % Math.max(1, items.length)];
  return (
    <div className="ss-quote ss-reveal" onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
      <div className="ss-quote-side">
        <div className="ss-quote-mark" aria-hidden="true">#1</div>
        <div>
          <div className="ss-quote-side-title">Årets raskeste</div>
          <div className="ss-quote-side-sub">Lederne på hver distanse i {year}</div>
        </div>
      </div>
      <div className="ss-quote-main" aria-live="polite">
        <div className="ss-quote-dots" role="tablist" aria-label="Velg distanse og klasse">
          {items.map((it, k) => (
            <button
              key={`${it.d.key}-${it.g}`}
              role="tab"
              aria-current={k === i}
              aria-label={`${it.d.label}, ${it.g === "M" ? "herrer" : "damer"}`}
              onClick={() => setI(k)}
            />
          ))}
        </div>
        {cur ? (
          <>
            <p className="ss-quote-text" key={`t${i}`}>
              Raskest på {cur.d.label.toLowerCase()} blant {cur.g === "M" ? "herrene" : "damene"} i år er <b>{cur.e.display_name}</b> med{" "}
              <b>{formatTime(cur.e.best_time_ms)}</b>
              {cur.e.event_name ? <>, satt i {cur.e.event_name}.</> : "."}
            </p>
            <div className="ss-quote-who" key={`w${i}`}>
              <Link href={`/utovere?athleteId=${cur.e.athlete_id}`} className="ss-quote-person">
                <span className="ss-avatar ss-avatar--brand">{initials(cur.e.display_name)}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="ss-quote-name">{cur.e.display_name}</span>
                  <span className="ss-quote-meta">{[cur.e.club, `${cur.d.label} · ${cur.g === "M" ? "Herrer" : "Damer"}`].filter(Boolean).join(" · ")}</span>
                </span>
              </Link>
              <span className="ss-quote-big">{formatTime(cur.e.best_time_ms)}</span>
            </div>
          </>
        ) : boards ? (
          <p className="ss-quote-text">Ingen resultater registrert for {year} ennå.</p>
        ) : (
          <>
            <div className="ss-skel" style={{ height: 34, width: "85%" }} />
            <div className="ss-skel" style={{ height: 40, width: "40%" }} />
          </>
        )}
      </div>
    </div>
  );
}

const SERVICES = [
  { href: "/utovere", title: "Utøversøk", desc: "Søk opp hvilken som helst løper og se personlige rekorder, plasseringer og utvikling over tid." },
  { href: "/utovere/sammenlign", title: "Sammenlign", desc: "Velg opptil fire løpere og se rekorder, innbyrdes oppgjør og sesongbeste side om side." },
  { href: "/utovere/topp100", title: "Topplister", desc: "Årets 100 raskeste herrer og damer på 5 km, 10 km, halvmaraton og maraton." },
  { href: "/lop", title: "Løp", desc: "Finn løpet ditt og se snittider, løyperekorder og hvordan det har utviklet seg år for år." },
];

const FAQ = [
  {
    q: "Hvor kommer resultatene fra?",
    a: "Fra tidtakerne EQ Timing, Ultimate LIVE, RaceResult og Racedays. Nye løp hentes inn automatisk når resultatlistene er publisert.",
  },
  {
    q: "Hvordan regnes topplistene ut?",
    a: "Hver løper telles med sin beste tid på distansen i løpet av året, og bare fra fullstendige resultatlister. Like tider deler plass.",
  },
  {
    q: "Hvorfor mangler et løp eller et resultat?",
    a: "Vi tar bare med løp der hele resultatlisten er tilgjengelig hos en av tidtakerne. Når du åpner en utøverprofil, sjekker vi også EQ Timing for nye resultater for den løperen.",
  },
  {
    q: "Kan jeg dele en sammenligning?",
    a: "Ja. Under Sammenlign velger du opptil fire løpere, og lenken i adressefeltet viser akkurat den sammenligningen til den du sender den til.",
  },
];

export default function HomeClient() {
  const router = useRouter();
  const year = new Date().getFullYear();
  const recent = useRecentAthletes();
  const { data: stats } = useJson<Stats>("/api/stats", (d) => ((d as { ok?: boolean })?.ok ? (d as Stats) : null));
  const { data: boards } = useJson<Boards>(`/api/leaderboards?year=${year}`, (d) => ((d as { ok?: boolean; results?: Boards })?.ok ? (d as { results: Boards }).results : null));
  const { data: events, done: eventsDone } = useJson<RecentEvent[]>("/api/events/recent?limit=8", (d) => {
    const ev = (d as { events?: RecentEvent[] })?.events;
    return Array.isArray(ev) ? ev : [];
  });

  const n = (v?: number) => (v != null ? nf.format(v) : "…");

  return (
    <div className="ss-page">
      {/* ── Hero ── */}
      <section className="ss-hero">
        <div className="ss-container">
          <div className="ss-hero-inner">
            <div className="ss-hero-copy">
              <h1 className="ss-hero-title" aria-label="Alle løpsresultater i Norge. Ett søk unna.">
                <Words text="Alle løpsresultater i Norge." />{" "}
                <em><Words text="Ett søk unna." offset={4} /></em>
              </h1>
              <div className="ss-intro" style={{ "--d": "520ms" } as React.CSSProperties}>
              <AthleteSearch
                size="lg"
                placeholder="Søk etter utøver…"
                onSelect={(h) => router.push(`/utovere?athleteId=${h.id}`)}
                onSubmit={(q) => router.push(`/utovere?q=${encodeURIComponent(q)}`)}
              />
              </div>
            </div>
          </div>
          <div className="ss-hero-meta ss-intro" style={{ "--d": "760ms" } as React.CSSProperties}>
            <span>Norges løpsdatabase</span>
            <span><b>{stats ? <CountUp value={stats.athletes} /> : "…"}</b> utøvere</span>
            <span className="ss-hide-sm"><b>{stats ? <CountUp value={stats.events} /> : "…"}</b> løp</span>
            <span className="ss-scrollhint">Scroll for å utforske <ArrowDown size={14} /></span>
          </div>
          <div className="ss-wordmark-wrap" aria-hidden="true">
            <div className="ss-wordmark">
              {"Startstreken".split("").map((ch, i) => (
                <span key={i} style={{ "--i": i } as React.CSSProperties}>{ch}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="ss-container">
        {/* ── Statement ── */}
        <section className="ss-section" style={{ paddingTop: 96 }}>
          <p className="ss-statement ss-reveal">
            Vi samler resultater fra <b>{stats ? `${n(stats.events)} løp` : "hundrevis av løp"}</b> og{" "}
            <b>{stats ? `${n(stats.athletes)} løpere` : "tusenvis av løpere"}</b> – så du kan finne rekordene dine, se hvem som er raskest i år og måle deg mot hvem du vil.
          </p>
          {recent.length > 0 && (
            <div style={{ marginTop: 40 }}>
              <div className="ss-eyebrow" style={{ marginBottom: 12 }}>Nylig sett</div>
              <div className="ss-recent">
                {recent.map((a) => (
                  <Link key={a.id} href={`/utovere?athleteId=${a.id}`} className="ss-recent-item">
                    <span className="ss-avatar ss-avatar--sm" style={{ width: 36, height: 36 }}>{initials(a.display_name)}</span>
                    {a.display_name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── Showcase ── */}
        <section className="ss-section" style={{ paddingTop: 24 }}>
          <Link href="/lop" className="ss-showcase ss-reveal">
            <Image src={running} alt="Løpere i fart" fill sizes="(max-width: 1360px) 100vw, 1280px" placeholder="blur" />
            <div className="ss-tags">
              {MAIN_DISTANCES.map((d) => (
                <span key={d.key} className="ss-tag">{d.label}</span>
              ))}
            </div>
            <div className="ss-showcase-copy">
              <div className="ss-showcase-title">Sesongen {year}</div>
              <div className="ss-showcase-sub">
                {stats ? `${n(stats.events_year)} løp · ${n(stats.results)} resultater totalt` : "Løp og resultater"}
              </div>
            </div>
          </Link>
        </section>

        {/* ── Top lists ── */}
        <section className="ss-section">
          <div className="ss-section-head">
            <div>
              <h2 className="ss-h2 ss-reveal">Årets <em>topplister</em></h2>
              <p className="ss-sub">De raskeste herrene og damene på hver distanse i {year}, fra fullstendige resultatlister.</p>
            </div>
            <Link href="/utovere/topp100" className="ss-link">Se topp 100 <ArrowUpRight size={16} /></Link>
          </div>
          <div className="ss-dist-grid">
            {MAIN_DISTANCES.map((d, i) => (
              <DistCard key={d.key} dist={d} data={boards?.[d.key]} year={year} delay={(i % 2) * 120} />
            ))}
          </div>
        </section>

        {/* ── Leaders ── */}
        <section className="ss-section">
          <Leaders boards={boards} year={year} />
        </section>

        {/* ── Latest races ── */}
        <section className="ss-section">
          <div className="ss-section-head">
            <h2 className="ss-h2 ss-reveal">Siste <em>resultater</em></h2>
            <Link href="/lop" className="ss-link">Alle løp <ArrowUpRight size={16} /></Link>
          </div>
          {!eventsDone ? (
            <div className="ss-rail">
              {[0, 1, 2, 3].map((k) => <div key={k} className="ss-skel" style={{ height: 240, borderRadius: 22 }} />)}
            </div>
          ) : !events || events.length === 0 ? (
            <div className="ss-card ss-empty">Ingen løp å vise ennå.</div>
          ) : (
            <div className="ss-rail ss-reveal ss-stagger">
              {events.map((ev) => {
                const dp = dateParts(ev.start_date);
                return (
                  <Link key={ev.id} href={`/lop/${ev.id}`} className="ss-race-card">
                    <div className="ss-race-card-date">
                      {dp ? `${dp.day}. ${dp.month}` : "–"}
                      <small>{dp?.year}</small>
                    </div>
                    <div>
                      <div className="ss-race-card-name">{ev.name}</div>
                      <div className="ss-race-card-meta">
                        {[ev.location, `${nf.format(ev.finishers)} fullførte`].filter(Boolean).join(" · ")}
                      </div>
                      {ev.categories.length > 0 && (
                        <div className="ss-tags" style={{ marginTop: 14 }}>
                          {ev.categories.map((c) => (
                            <span key={c} className="ss-tag" style={{ height: 30, fontSize: 13 }}>{distanceLabel(c)}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* ── What you can do (light band) ── */}
      <section className="ss-light ss-band" style={{ marginTop: 56 }}>
        <div className="ss-container">
          <h2 className="ss-h2 ss-reveal" style={{ textAlign: "center" }}>Alt om <em>løpene dine</em></h2>
          <div className="ss-services ss-reveal ss-stagger">
            {SERVICES.map((s) => (
              <Link key={s.href} href={s.href} className="ss-service">
                <div className="ss-service-title">{s.title}</div>
                <div className="ss-service-label">Info</div>
                <div className="ss-service-desc">{s.desc}</div>
                <span className="ss-arrow" aria-hidden="true"><ArrowUpRight size={18} /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="ss-container">
        {/* ── FAQ ── */}
        <section className="ss-section" style={{ paddingTop: 96 }}>
          <div className="ss-section-head">
            <h2 className="ss-h2 ss-reveal">Ofte stilte <em>spørsmål</em></h2>
          </div>
          <div className="ss-faq ss-reveal ss-stagger">
            {FAQ.map((f, k) => (
              <details key={f.q} className="ss-faq-item" open={k === 0}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Call to action ── */}
        <section className="ss-section">
          <div className="ss-cta ss-reveal">
            <h2 className="ss-h2">Klar til å finne <em>tidene dine?</em></h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link href="/utovere" className="ss-btn ss-btn--primary">Søk etter utøver</Link>
              <Link href="/lop" className="ss-btn">Se alle løp</Link>
            </div>
          </div>
        </section>

        <footer className="ss-footer">
          <div className="ss-footer-row">
            <div className="ss-footer-brand">
              <span className="ss-logo" aria-hidden="true">
                <LogoMark />
                <span className="ss-logo-text">Startstreken</span>
              </span>
              <span>Norges løpsdatabase · © {year}</span>
            </div>
            <nav className="ss-footer-links" aria-label="Bunnmeny">
              <Link href="/utovere">Utøvere</Link>
              <Link href="/lop">Løp</Link>
              <Link href="/utovere/topp100">Topplister</Link>
              <Link href="/utovere/sammenlign">Sammenlign</Link>
            </nav>
          </div>
          <div className="ss-footer-word" aria-hidden="true">Startstreken</div>
        </footer>
      </div>
    </div>
  );
}
