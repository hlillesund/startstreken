"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { MAIN_DISTANCES, dateParts, formatDateShort, formatPace, formatTime, norm } from "@/components/utovere/utils";

export type GroupItem = {
  slug: string;
  name: string;
  location: string | null;
  first: string | null;
  last: string | null;
  editions: number;
  finishers: number;
  courses: { cat: string; n: number; avg: number | null; avgM: number | null; avgF: number | null }[];
  other: boolean;
};
export type LatestItem = { id: string; name: string; date: string | null; finishers: number };

type Sort = "latest" | "size" | "editions" | "fast";
const SORTS: { key: Sort; label: string }[] = [
  { key: "latest", label: "Siste" },
  { key: "size", label: "Størst" },
  { key: "editions", label: "Flest år" },
  { key: "fast", label: "Raskest" },
];
const DISTS = [...MAIN_DISTANCES.map((d) => ({ key: d.key as string, label: d.short })), { key: "OTHER", label: "Annet" }];
const PAGE = 60;
const nf = new Intl.NumberFormat("nb-NO");

const yearSpan = (g: GroupItem) => {
  const a = g.first?.slice(0, 4), b = g.last?.slice(0, 4);
  return !a || !b ? null : a === b ? a : `${a}–${b}`;
};

export default function LopBrowser({
  groups,
  latest,
  initial,
  totals,
}: {
  groups: GroupItem[];
  latest: LatestItem[];
  initial: { q: string; d: string; s: string };
  totals: { editions: number; results: number };
}) {
  const [q, setQ] = useState(initial.q);
  const [dist, setDist] = useState(DISTS.some((d) => d.key === initial.d) ? initial.d : "");
  const [sort, setSort] = useState<Sort>(SORTS.some((s) => s.key === initial.s) ? (initial.s as Sort) : "latest");
  // "Vis flere" count, reset whenever the filters change
  const sig = `${q}|${dist}|${sort}`;
  const [more, setMore] = useState({ sig, n: PAGE });
  const shown = more.sig === sig ? more.n : PAGE;
  const mainDist = MAIN_DISTANCES.find((d) => d.key === dist) ?? null;
  const effSort: Sort = sort === "fast" && !mainDist ? "latest" : sort;

  // Keep the URL shareable without re-rendering the server page.
  useEffect(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (dist) p.set("d", dist);
    if (sort !== "latest") p.set("s", sort);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `/lop?${qs}` : "/lop");
  }, [q, dist, sort]);

  const list = useMemo(() => {
    const words = norm(q).split(" ").filter(Boolean);
    const out = groups.filter((g) => {
      if (dist === "OTHER" ? !g.other : dist && !g.courses.some((c) => c.cat === dist)) return false;
      if (!words.length) return true;
      const hay = norm(`${g.name} ${g.location ?? ""}`);
      return words.every((w) => hay.includes(w));
    });
    const avgOf = (g: GroupItem) => g.courses.find((c) => c.cat === dist)?.avg ?? Infinity;
    // A handful of finishers says little about how fast a course is: rank those last.
    const thin = (g: GroupItem) => ((g.courses.find((c) => c.cat === dist)?.n ?? 0) < 20 ? 1 : 0);
    const cmp: Record<Sort, (a: GroupItem, b: GroupItem) => number> = {
      latest: (a, b) => (b.last ?? "").localeCompare(a.last ?? ""),
      size: (a, b) => b.finishers - a.finishers,
      editions: (a, b) => b.editions - a.editions || b.finishers - a.finishers,
      fast: (a, b) => thin(a) - thin(b) || avgOf(a) - avgOf(b),
    };
    return out.sort(cmp[effSort]);
  }, [groups, q, dist, effSort]);

  const filtering = q.trim() !== "" || dist !== "";

  return (
    <div className="ss-container">
      <div className="ss-pagehead">
        <div className="ss-eyebrow">Løp</div>
        <h1 className="ss-h1" style={{ marginTop: 6 }}>Løp og <em>resultater</em></h1>
        <p className="ss-sub">
          {nf.format(groups.length)} løp · {nf.format(totals.editions)} utgaver · {nf.format(totals.results)} resultater fra fullstendige
          resultatlister. Se snittider, løyperekorder og hvordan løpet har utviklet seg over år.
        </p>
      </div>

      <div className="ss-lop-search">
        <div className="ss-search-field">
          <Search size={18} />
          <input
            className="ss-search-input"
            type="search"
            placeholder="Søk etter løp eller sted…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Søk etter løp"
            autoComplete="off"
          />
          {q && (
            <button className="ss-search-clear" onClick={() => setQ("")} aria-label="Tøm søk">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="ss-filters" style={{ marginTop: 12 }}>
        <div className="ss-seg" role="tablist" aria-label="Distanse">
          <button className={`ss-seg-btn${dist === "" ? " active" : ""}`} onClick={() => setDist("")}>Alle</button>
          {DISTS.map((d) => (
            <button key={d.key} className={`ss-seg-btn${dist === d.key ? " active" : ""}`} onClick={() => setDist(d.key)}>
              {d.label}
            </button>
          ))}
        </div>
        <div className="ss-seg" aria-label="Sortering">
          {SORTS.filter((s) => s.key !== "fast" || mainDist).map((s) => (
            <button key={s.key} className={`ss-seg-btn${effSort === s.key ? " active" : ""}`} onClick={() => setSort(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {!filtering && latest.length > 0 && (
        <section className="ss-section" style={{ paddingBottom: 0 }}>
          <div className="ss-section-head">
            <h2 className="ss-h2">Siste resultater</h2>
          </div>
          <div className="ss-recent">
            {latest.map((e) => {
              const dp = dateParts(e.date);
              return (
                <Link key={e.id} href={`/lop/${e.id}`} className="ss-lop-latest">
                  <span className="ss-date" aria-hidden="true">
                    <span className="ss-date-d">{dp?.day ?? "–"}</span>
                    <span className="ss-date-m">{dp?.month ?? ""}</span>
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="ss-list-item-title" style={{ display: "block" }}>{e.name}</span>
                    <span className="ss-list-item-meta" style={{ display: "block" }}>{nf.format(e.finishers)} fullførte</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="ss-section">
        <div className="ss-card">
          <div className="ss-toolbar">
            <h2 className="ss-h3">
              {mainDist ? mainDist.label : dist === "OTHER" ? "Andre distanser" : "Alle løp"}
              <span className="ss-muted" style={{ fontWeight: 500 }}> · {nf.format(list.length)}</span>
            </h2>
            {mainDist && <span className="ss-muted" style={{ fontSize: 13 }}>Snittid alle år · menn / kvinner</span>}
          </div>
          {list.length === 0 ? (
            <div className="ss-empty">Ingen løp matcher søket.</div>
          ) : (
            <ol className="ss-lop-list">
              {list.slice(0, shown).map((g, i) => {
                const c = mainDist ? g.courses.find((x) => x.cat === dist) : null;
                const years = yearSpan(g);
                return (
                  <li key={g.slug}>
                    <Link href={`/lop/${g.slug}${mainDist ? `?d=${dist}` : ""}`} className="ss-lop-row">
                      {effSort === "fast" ? (
                        <span className={`ss-rank${i < 3 ? ` ss-rank--${i + 1}` : ""}`}>{i + 1}</span>
                      ) : null}
                      <span className="ss-lop-row-body">
                        <span className="ss-lop-row-name">{g.name}</span>
                        <span className="ss-lop-row-meta">
                          {[
                            g.location,
                            g.editions > 1 ? `${g.editions} utgaver${years ? ` (${years})` : ""}` : formatDateShort(g.last),
                            !c ? `${nf.format(g.finishers)} fullførte` : `${nf.format(c.n)} fullførte`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        {!mainDist && (g.courses.length > 0 || g.other) && (
                          <span className="ss-lop-row-tags">
                            {g.courses.map((x) => (
                              <span key={x.cat} className="ss-badge">{MAIN_DISTANCES.find((d) => d.key === x.cat)?.short}</span>
                            ))}
                            {g.other && <span className="ss-badge">Annet</span>}
                          </span>
                        )}
                      </span>
                      {c ? (
                        <span className="ss-lop-row-stat">
                          <span className="ss-lop-row-time">{formatTime(c.avg ?? 0)}</span>
                          <span className="ss-lop-row-sub">
                            {c.avgM ? formatTime(c.avgM) : "—"} / {c.avgF ? formatTime(c.avgF) : "—"}
                          </span>
                          <span className="ss-lop-row-sub ss-hide-sm">{formatPace(c.avg, mainDist!.meters)}</span>
                        </span>
                      ) : (
                        <ChevronRight size={18} className="ss-muted" style={{ flexShrink: 0 }} />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
          {list.length > shown && (
            <div className="ss-lb-foot">
              <button className="ss-btn ss-btn--sm" onClick={() => setMore({ sig, n: shown + PAGE })}>
                Vis flere ({nf.format(list.length - shown)})
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
