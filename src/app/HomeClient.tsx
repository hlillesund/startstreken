"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, GitCompareArrows, Trophy, Route } from "lucide-react";
import AthleteSearch from "@/components/AthleteSearch";
import TopLeaderboards from "@/components/utovere/TopLeaderBoards";
import { dateParts, distanceLabel, initials } from "@/components/utovere/utils";
import { useRecentAthletes } from "@/lib/recent-athletes";

type Stats = { athletes: number; results: number; events: number; events_year: number; year: number };
type RecentEvent = {
  id: string;
  name: string;
  start_date: string | null;
  location: string | null;
  finishers: number;
  categories: string[];
};

const nf = new Intl.NumberFormat("nb-NO");

function raceHref(ev: RecentEvent) {
  return `/lop/${ev.id}`;
}

function RecentRaces() {
  const [events, setEvents] = useState<RecentEvent[] | null>(null);

  useEffect(() => {
    fetch("/api/events/recent?limit=6")
      .then((r) => r.json())
      .then((d) => setEvents(Array.isArray(d?.events) ? d.events : []))
      .catch(() => setEvents([]));
  }, []);

  return (
    <section className="ss-card" aria-label="Siste løp">
      <div className="ss-lb-head">
        <h2 className="ss-h2">Siste resultater</h2>
        <Link href="/lop" className="ss-link">
          Alle løp <ChevronRight size={16} />
        </Link>
      </div>
      {events === null && (
        <ul className="ss-list">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="ss-list-item">
              <span className="ss-skel" style={{ width: 44, height: 44, borderRadius: 10 }} />
              <span style={{ flex: 1, display: "grid", gap: 6 }}>
                <span className="ss-skel" style={{ height: 14, width: "70%" }} />
                <span className="ss-skel" style={{ height: 12, width: "45%" }} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {events?.length === 0 && <div className="ss-empty">Ingen løp å vise ennå.</div>}
      {events && events.length > 0 && (
        <ul className="ss-list">
          {events.map((ev) => {
            const dp = dateParts(ev.start_date);
            const href = raceHref(ev);
            const body = (
              <>
                <span className="ss-date" aria-hidden="true">
                  <span className="ss-date-d">{dp?.day ?? "–"}</span>
                  <span className="ss-date-m">{dp?.month ?? ""}</span>
                </span>
                <span className="ss-list-item-body">
                  <span className="ss-list-item-title" style={{ display: "block" }}>{ev.name}</span>
                  <span className="ss-list-item-meta" style={{ display: "block" }}>
                    {[ev.location, `${nf.format(ev.finishers)} fullførte`, ev.categories.map(distanceLabel).join(", ")]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {href && <ChevronRight size={18} className="ss-muted" />}
              </>
            );
            return (
              <li key={ev.id}>
                {href ? (
                  <Link href={href} className="ss-list-item">{body}</Link>
                ) : (
                  <div className="ss-list-item">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function HomeClient() {
  const router = useRouter();
  const year = new Date().getFullYear();
  const [stats, setStats] = useState<Stats | null>(null);
  const recent = useRecentAthletes();

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => d?.ok && setStats(d))
      .catch(() => {});
  }, []);

  const statItems = [
    { label: "Utøvere", value: stats?.athletes },
    { label: "Resultater", value: stats?.results },
    { label: "Løp i databasen", value: stats?.events },
    { label: `Løp i ${year}`, value: stats?.events_year },
  ];

  return (
    <div className="ss-page">
      <section className="ss-hero">
        <div className="ss-container">
          <div className="ss-hero-inner">
            
            <h1 className="ss-hero-title">
              Alle løpsresultater.
              <br />
              <em>Ett søk unna.</em>
            </h1>
            <p className="ss-hero-desc">
              Finn hvilken som helst løper i Norge – se personlige rekorder, rangering, utvikling og sammenlign mot andre.
            </p>

            <AthleteSearch
              size="lg"
              placeholder="Søk etter utøver…"
              onSelect={(h) => router.push(`/utovere?athleteId=${h.id}`)}
              onSubmit={(q) => router.push(`/utovere?q=${encodeURIComponent(q)}`)}
            />

           
          </div>
        </div>
      </section>

      <div className="ss-container">
        <div className="ss-stats">
          {statItems.map((s) => (
            <div key={s.label} className="ss-card ss-stat">
              <div className="ss-stat-val ss-num">
                {s.value != null ? nf.format(s.value) : <span className="ss-skel" style={{ display: "inline-block", width: 80, height: 22 }} />}
              </div>
              <div className="ss-stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        {recent.length > 0 && (
          <section className="ss-section" style={{ paddingBottom: 0 }}>
            <div className="ss-section-head">
              <h2 className="ss-h2">Nylig sett</h2>
            </div>
            <div className="ss-recent">
              {recent.map((a) => (
                <Link key={a.id} href={`/utovere?athleteId=${a.id}`} className="ss-recent-item">
                  <span className="ss-avatar ss-avatar--sm" style={{ width: 36, height: 36 }}>{initials(a.display_name)}</span>
                  {a.display_name}
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="ss-section">
          <div className="ss-grid-2">
            <TopLeaderboards year={year} />
            <RecentRaces />
          </div>
        </section>

        <section className="ss-section">
          <div className="ss-section-head">
            <div>
              <h2 className="ss-h2">Utforsk</h2>
              <p className="ss-sub">Mer enn bare resultatlister.</p>
            </div>
          </div>
          <div className="ss-features">
            <Link href="/utovere/sammenlign" className="ss-card ss-feature ss-feature--accent">
              <span className="ss-feature-icon"><GitCompareArrows size={22} /></span>
              <span>
                <span className="ss-feature-title" style={{ display: "block" }}>Sammenlign utøvere</span>
                <span className="ss-feature-desc" style={{ display: "block" }}>Rekorder, innbyrdes oppgjør og utvikling – opptil fire løpere side om side.</span>
              </span>
            </Link>
            <Link href="/utovere/topp100" className="ss-card ss-feature">
              <span className="ss-feature-icon"><Trophy size={22} /></span>
              <span>
                <span className="ss-feature-title" style={{ display: "block" }}>Topp 100</span>
                <span className="ss-feature-desc" style={{ display: "block" }}>Årets raskeste på 5 km, 10 km, halvmaraton og maraton.</span>
              </span>
            </Link>
            <Link href="/lop" className="ss-card ss-feature">
              <span className="ss-feature-icon"><Route size={22} /></span>
              <span>
                <span className="ss-feature-title" style={{ display: "block" }}>Finn raske løyper</span>
                <span className="ss-feature-desc" style={{ display: "block" }}>Se hvilke løp som gir de raskeste tidene og flest deltakere.</span>
              </span>
            </Link>
          </div>
        </section>

        <footer className="ss-footer">
          <div className="ss-footer-row">
            <span>© {year} Startstreken · Norges løpsdatabase</span>
            <span style={{ display: "inline-flex", gap: 16 }}>
              <Link href="/utovere">Utøvere</Link>
              <Link href="/utovere/topp100">Topplister</Link>
              <Link href="/utovere/sammenlign">Sammenlign</Link>
              <Link href="/lop">Løp</Link>
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
