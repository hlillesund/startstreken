import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getClub } from "@/lib/clubs";
import { MAIN_DISTANCES } from "@/components/utovere/utils";
import ClubView, { type ClubTop } from "./ClubView";

export const dynamic = "force-dynamic";

type Params = { slug: string };
type Search = { sesong?: string };

function season(raw?: string) {
  const now = new Date().getFullYear();
  const y = Number(raw);
  return { now, year: Number.isInteger(y) && y >= 2000 && y <= now ? y : now };
}

export async function generateMetadata({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }): Promise<Metadata> {
  const { slug } = await params;
  const { year } = season((await searchParams).sesong);
  const club = await getClub(decodeURIComponent(slug), year).catch(() => null);
  if (!club) return { title: "Klubb – Startstreken" };
  return {
    title: `${club.name} ${year} – Startstreken`,
    description: `${club.members.length} løpere fra ${club.name} har resultater i ${year}. Se klubbens raskeste, de mest aktive og siste resultater.`,
  };
}

export default async function ClubPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  const slug = decodeURIComponent((await params).slug);
  const { now, year } = season((await searchParams).sesong);
  const club = await getClub(slug, year);

  if (!club) {
    // the club may simply have no results this season
    if (year === now) {
      const last = await getClub(slug, now - 1).catch(() => null);
      if (!last) notFound();
    } else notFound();
  }

  const href = (s: number) => `/klubber/${encodeURIComponent(slug)}?sesong=${s}`;
  const seasons = (
    <nav className="ss-seg ss-intro" aria-label="Sesong" style={{ "--d": "240ms" } as React.CSSProperties}>
      {[now, now - 1, now - 2].map((s) => (
        <Link key={s} href={href(s)} className={`ss-seg-btn${s === year ? " active" : ""}`} aria-current={s === year ? "page" : undefined}>
          {s}
        </Link>
      ))}
    </nav>
  );

  if (!club) {
    return (
      <div className="ss-page">
        <div className="ss-container ss-ap">
          <header className="ss-ap-head">
            <Link href="/klubber" className="ss-back"><ArrowLeft size={16} /> Alle klubber</Link>
            <h1 className="ss-ap-name">Klubb</h1>
            <div style={{ marginTop: 20 }}>{seasons}</div>
          </header>
          <div className="ss-card ss-empty" style={{ margin: "24px 0 48px" }}>Ingen resultater for klubben i {year} ennå.</div>
        </div>
      </div>
    );
  }

  // the fastest five per distance and gender
  const top: ClubTop = {};
  for (const d of MAIN_DISTANCES) {
    for (const g of ["F", "M"] as const) {
      const list = club.members
        .filter((m) => m.gender === g && m.best[d.key])
        .map((m) => ({ athlete_id: m.athlete_id, display_name: m.display_name, birth_year: m.birth_year, ...m.best[d.key]! }))
        .sort((a, b) => a.t - b.t)
        .slice(0, 5);
      (top[d.key] ??= { F: [], M: [] })[g] = list;
    }
  }

  const women = club.members.filter((m) => m.gender === "F").length;
  const men = club.members.filter((m) => m.gender === "M").length;
  const [first, ...rest] = club.name.split(" ");

  return (
    <div className="ss-page">
      <div className="ss-container ss-ap">
        <header className="ss-ap-head">
          <Link href={`/klubber?sesong=${year}`} className="ss-back ss-intro"><ArrowLeft size={16} /> Alle klubber</Link>
          <h1 className="ss-ap-name ss-intro" style={{ "--d": "60ms" } as React.CSSProperties}>
            {first} {rest.length > 0 && <em>{rest.join(" ")}</em>}
          </h1>
          <div className="ss-ap-meta ss-intro" style={{ "--d": "160ms" } as React.CSSProperties}>
            <span>Løpeklubb</span>
            <span>Sesongen {year}</span>
          </div>
          <div style={{ marginTop: 20 }}>{seasons}</div>
        </header>

        <ClubView
          year={year}
          runners={club.members.length}
          women={women}
          men={men}
          races={club.races}
          results={club.members.reduce((s, m) => s + m.races, 0)}
          top={top}
          members={club.members.map((m) => ({ athlete_id: m.athlete_id, display_name: m.display_name, birth_year: m.birth_year, races: m.races }))}
          recent={club.recent}
        />
      </div>
    </div>
  );
}
