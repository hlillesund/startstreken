"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { ClubRow } from "@/lib/clubs";
import { MAIN_DISTANCES, formatTime, norm } from "@/components/utovere/utils";

const nf = new Intl.NumberFormat("nb-NO");
const SORTS = [{ key: "runners", label: "Flest løpere" }, ...MAIN_DISTANCES.map((d) => ({ key: d.key as string, label: `Lagtid ${d.short}` }))];
const LIMIT = 50;

export default function ClubList({ clubs, year }: { clubs: ClubRow[]; year: number }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("runners");
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => {
    const base = sort === "runners" ? clubs : clubs.filter((c) => c.top3[sort] != null).sort((a, b) => a.top3[sort]! - b.top3[sort]!);
    // rank before filtering, so a search keeps the club's real position
    const ranked = base.map((c, i) => ({ c, rank: i + 1 }));
    const nq = norm(q);
    return nq ? ranked.filter(({ c }) => norm(c.name).includes(nq)) : ranked;
  }, [clubs, sort, q]);

  const visible = showAll || q ? rows : rows.slice(0, LIMIT);
  const dist = MAIN_DISTANCES.find((d) => d.key === sort);

  return (
    <div className="ss-card">
      <div className="ss-toolbar">
        <div className="ss-search-field ss-search-field--sm">
          <Search size={16} aria-hidden="true" />
          <input className="ss-search-input" type="search" placeholder="Finn klubb" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Finn klubb" />
          {q && (
            <button type="button" className="ss-search-clear" onClick={() => setQ("")} aria-label="Tøm søket">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="ss-chips" role="tablist" aria-label="Sorter">
          {SORTS.map((s) => (
            <button key={s.key} type="button" role="tab" aria-selected={sort === s.key} className={`ss-chip${sort === s.key ? " active" : ""}`} onClick={() => setSort(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="ss-empty">{q ? `Ingen klubber som matcher «${q}».` : `Ingen klubber med tre løpere på ${dist?.label.toLowerCase()} i ${year}.`}</div>
      ) : (
        <ol className="ss-rank-table">
          {visible.map(({ c, rank }) => (
            <li key={c.slug}>
              <Link href={`/klubber/${encodeURIComponent(c.slug)}?sesong=${year}`} className="ss-rank-row">
                <span className={`ss-rank${rank <= 3 ? ` ss-rank--${rank}` : ""}`}>{rank}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="ss-lb-name" style={{ display: "block" }}>{c.name}</span>
                  <span className="ss-lb-meta" style={{ display: "block" }}>
                    {nf.format(c.runners)} løpere · {nf.format(c.results)} resultater
                  </span>
                </span>
                <span style={{ textAlign: "right" }}>
                  {dist ? (
                    <>
                      <span className="ss-lb-time" style={{ display: "block" }}>{formatTime(c.top3[dist.key]!)}</span>
                      <span className="ss-lb-meta" style={{ display: "block" }}>snitt topp 3</span>
                    </>
                  ) : (
                    <>
                      <span className="ss-lb-time" style={{ display: "block" }}>{nf.format(c.runners)}</span>
                      <span className="ss-lb-meta" style={{ display: "block" }}>løpere</span>
                    </>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      {!showAll && !q && rows.length > LIMIT && (
        <div style={{ padding: "4px 16px 18px" }}>
          <button type="button" className="ss-btn" style={{ width: "100%" }} onClick={() => setShowAll(true)}>
            Vis alle {nf.format(rows.length)}
          </button>
        </div>
      )}
    </div>
  );
}
