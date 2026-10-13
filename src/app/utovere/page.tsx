"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import AthleteSearch from "@/components/AthleteSearch";
import AthleteProfile from "@/components/utovere/AthleteProfile";
import TopLeaderboards from "@/components/utovere/TopLeaderBoards";
import type { AthleteHit, AthleteResultRow } from "@/components/utovere/types";
import { fetchAthlete, fetchRanks, fetchResults, refreshFromSource, type RankMap } from "@/components/utovere/data";
import { addRecentAthlete, removeRecentAthlete } from "@/lib/recent-athletes";

const YEAR = new Date().getFullYear();

function readParams() {
  const p = new URLSearchParams(window.location.search);
  return { athleteId: p.get("athleteId"), q: p.get("q") ?? "" };
}

/* ── Search view ─────────────────────────────────────────── */
function SearchView({ initialQuery, onSelect }: { initialQuery: string; onSelect: (h: AthleteHit) => void }) {
  return (
    <>
      <div className="ss-container">
        <div className="ss-pagehead">
          <h1 className="ss-h1">Finn <em>utøvere</em></h1>
          <p className="ss-sub">Søk blant alle løpere i databasen – se rekorder, plasseringer og utvikling.</p>
        </div>
        <div style={{ marginTop: 16, maxWidth: 720 }}>
          <AthleteSearch
            key={initialQuery}
            inline
            autoFocus={!initialQuery}
            initialQuery={initialQuery}
            limit={12}
            placeholder="Skriv et navn…"
            onSelect={onSelect}
          />
        </div>
      </div>
      <div className="ss-container">
        <section className="ss-section">
          <TopLeaderboards year={YEAR} onSelectAthlete={onSelect} />
        </section>
      </div>
    </>
  );
}

/* ── Profile view ────────────────────────────────────────── */
function ProfileSkeleton() {
  return (
    <div className="ss-container ss-ap">
      <div className="ss-ap-head">
        <span className="ss-skel" style={{ display: "block", height: 14, width: 80, marginBottom: 28 }} />
        <span className="ss-skel" style={{ display: "block", height: 64, width: "70%", borderRadius: 14 }} />
        <span className="ss-skel" style={{ display: "block", height: 16, width: "45%", marginTop: 18 }} />
      </div>
      <div className="ss-ap-stats">
        {[0, 1, 2, 3].map((i) => <span key={i} className="ss-skel" style={{ height: 120, borderRadius: 22 }} />)}
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────── */
export default function UtoverePage() {
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [athlete, setAthlete] = useState<AthleteHit | null>(null);
  const [results, setResults] = useState<AthleteResultRow[]>([]);
  const [ranks, setRanks] = useState<RankMap>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const pushedRef = useRef(false);
  const tokenRef = useRef(0);

  const load = useCallback(async (id: string, hint?: AthleteHit) => {
    const token = ++tokenRef.current;
    const alive = () => tokenRef.current === token;
    setAthleteId(id);
    setAthlete(hint ?? null);
    setResults([]);
    setRanks({});
    setNotFound(false);
    setLoading(true);
    window.scrollTo({ top: 0 });

    const [full, first] = await Promise.all([fetchAthlete(id), fetchResults(id)]);
    if (!alive()) return;
    let res = first;
    // the profile was merged into another one: continue there
    if (full && full.id !== id) {
      removeRecentAthlete(id);
      id = full.id;
      setAthleteId(id);
      window.history.replaceState(null, "", `/utovere?athleteId=${id}`);
      res = await fetchResults(id);
      if (!alive()) return;
    }
    if (!full && !hint) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const a = full ?? hint!;
    setAthlete(a);
    setResults(res);
    setLoading(false);
    addRecentAthlete(a);
    document.title = `${a.display_name} – Startstreken`;

    fetchRanks(id, YEAR).then((r) => alive() && setRanks(r));

    setRefreshing(true);
    const changed = await refreshFromSource(id);
    if (!alive()) return;
    if (changed) {
      const fresh = await fetchResults(id);
      if (!alive()) return;
      if (fresh.length) setResults(fresh);
    }
    setRefreshing(false);
  }, []);

  const reset = useCallback(() => {
    tokenRef.current++;
    setAthleteId(null);
    setAthlete(null);
    setResults([]);
    setRanks({});
    setRefreshing(false);
    setNotFound(false);
    document.title = "Utøvere – Startstreken";
  }, []);

  // Sync with URL (initial load + back/forward)
  useEffect(() => {
    const sync = () => {
      const { athleteId: id, q } = readParams();
      setQuery(q);
      if (id) load(id);
      else reset();
      setReady(true);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [load, reset]);

  function select(hit: AthleteHit) {
    window.history.pushState(null, "", `/utovere?athleteId=${hit.id}`);
    pushedRef.current = true;
    load(hit.id, hit);
  }

  function back() {
    if (pushedRef.current) {
      window.history.back();
    } else {
      window.history.pushState(null, "", "/utovere");
      reset();
    }
  }

  return (
    <div className="ss-page">
      {!ready ? null : athleteId ? (
        notFound ? (
          <div className="ss-container">
            <div className="ss-pagehead">
              <button className="ss-back" onClick={back}><ArrowLeft size={16} /> Tilbake</button>
              <div className="ss-card ss-empty">Fant ikke utøveren.</div>
            </div>
          </div>
        ) : athlete ? (
          <AthleteProfile key={athlete.id} athlete={athlete} results={results} ranks={ranks} loading={loading} refreshing={refreshing} onBack={back} />
        ) : (
          <ProfileSkeleton />
        )
      ) : (
        <SearchView initialQuery={query} onSelect={select} />
      )}
    </div>
  );
}
