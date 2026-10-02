import type { Metadata } from "next";
import Link from "next/link";
import { getTop100, isSeasonCategory, type TopEntry } from "@/lib/season";
import { MAIN_DISTANCES, formatDateShort, formatPace, formatTime } from "@/components/utovere/utils";

export const dynamic = "force-dynamic";

const ALLOWED = new Set<string>(MAIN_DISTANCES.map((d) => d.key));

type Search = { category?: string; year?: string; gender?: string };

function parse(params: Search) {
  const now = new Date().getFullYear();
  const category = ALLOWED.has(params.category ?? "") ? params.category! : "HM";
  const y = Number(params.year);
  const year = Number.isInteger(y) && y >= 2000 && y <= now ? y : now;
  const gender: "M" | "F" = params.gender === "F" ? "F" : "M";
  return { category, year, gender, now };
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<Search> }): Promise<Metadata> {
  const { category, year, gender } = parse(await searchParams);
  const dist = MAIN_DISTANCES.find((d) => d.key === category)!.label;
  return {
    title: `Topp 100 ${dist.toLowerCase()} ${gender === "F" ? "kvinner" : "menn"} ${year} – Startstreken`,
    description: `De 100 raskeste norske ${gender === "F" ? "kvinnene" : "mennene"} på ${dist.toLowerCase()} i ${year}.`,
  };
}

function href(p: { category: string; year: number; gender: string }) {
  return `/utovere/topp100?category=${p.category}&gender=${p.gender}&year=${p.year}`;
}

export default async function Topp100Page({ searchParams }: { searchParams: Promise<Search> }) {
  const { category, year, gender, now } = parse(await searchParams);
  const dist = MAIN_DISTANCES.find((d) => d.key === category)!;
  let rows: TopEntry[] = [];
  let failed = false;
  try {
    rows = isSeasonCategory(category) ? await getTop100(category, year, gender) : [];
  } catch (err) {
    console.error("[topp100] error:", err);
    failed = true;
  }

  const years = [now, now - 1, now - 2];

  return (
    <div className="ss-page">
      <div className="ss-container">
        <div className="ss-pagehead">
          <div className="ss-eyebrow">Topplister · {year}</div>
          <h1 className="ss-h1" style={{ marginTop: 6 }}>
            Topp 100 {dist.label.toLowerCase()}
          </h1>
          <p className="ss-sub">Beste tid per utøver i {year}, fra fullstendig importerte resultatlister.</p>
        </div>

        <div className="ss-filters" style={{ marginTop: 16 }}>
          <nav className="ss-seg" aria-label="Distanse">
            {MAIN_DISTANCES.map((d) => (
              <Link key={d.key} href={href({ category: d.key, year, gender })} className={`ss-seg-btn${category === d.key ? " active" : ""}`} aria-current={category === d.key ? "page" : undefined}>
                {d.short}
              </Link>
            ))}
          </nav>
          <nav className="ss-seg" aria-label="Kjønn">
            {(["M", "F"] as const).map((g) => (
              <Link key={g} href={href({ category, year, gender: g })} className={`ss-seg-btn${gender === g ? " active" : ""}`} aria-current={gender === g ? "page" : undefined}>
                {g === "M" ? "Herrer" : "Damer"}
              </Link>
            ))}
          </nav>
          <nav className="ss-seg" aria-label="År">
            {years.map((y) => (
              <Link key={y} href={href({ category, year: y, gender })} className={`ss-seg-btn${year === y ? " active" : ""}`} aria-current={year === y ? "page" : undefined}>
                {y}
              </Link>
            ))}
          </nav>
        </div>

        <section className="ss-section">
          <div className="ss-card">
            {failed && <div className="ss-empty">Kunne ikke laste topplisten akkurat nå.</div>}
            {!failed && rows.length === 0 && <div className="ss-empty">Ingen resultater for {dist.label.toLowerCase()} i {year} ennå.</div>}
            {rows.length > 0 && (
              <ol className="ss-rank-table">
                {rows.map((row) => {
                  const { rank, best_time_ms: ms, start_date: date } = row;
                  return (
                    <li key={row.athlete_id}>
                      <Link href={`/utovere?athleteId=${row.athlete_id}`} className="ss-rank-row">
                        <span className={`ss-rank${rank <= 3 ? ` ss-rank--${rank}` : ""}`}>{rank}</span>
                        <span style={{ minWidth: 0 }}>
                          <span className="ss-lb-name" style={{ display: "block" }}>
                            {row.display_name}
                            {row.birth_year ? <span className="ss-muted" style={{ fontWeight: 500 }}> · {row.birth_year}</span> : null}
                          </span>
                          <span className="ss-lb-meta" style={{ display: "block" }}>
                            {[row.club, row.event_name, formatDateShort(date)].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span style={{ textAlign: "right" }}>
                          <span className="ss-lb-time" style={{ display: "block" }}>{formatTime(ms)}</span>
                          <span className="ss-lb-meta" style={{ display: "block" }}>{formatPace(ms, dist.meters)}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
