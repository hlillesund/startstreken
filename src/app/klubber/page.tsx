import type { Metadata } from "next";
import Link from "next/link";
import { getClubs, type ClubRow } from "@/lib/clubs";
import ClubList from "./ClubList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Klubber – Startstreken",
  description: "Norske løpeklubber rangert etter antall løpere og lagtid, med klubbsider for hver klubb.",
};

type Search = { sesong?: string };

export default async function KlubberPage({ searchParams }: { searchParams: Promise<Search> }) {
  const now = new Date().getFullYear();
  const y = Number((await searchParams).sesong);
  const year = Number.isInteger(y) && y >= 2000 && y <= now ? y : now;

  let clubs: ClubRow[] = [];
  let failed = false;
  try {
    clubs = await getClubs(year);
  } catch (err) {
    console.error("[klubber] error:", err);
    failed = true;
  }

  return (
    <div className="ss-page">
      <div className="ss-container">
        <div className="ss-pagehead">
          <div className="ss-eyebrow">Klubber · {year}</div>
          <h1 className="ss-h1" style={{ marginTop: 6 }}>
            Klubbene <em>i Norge</em>
          </h1>
          <p className="ss-sub">Klubbene som er registrert på resultatene i {year}. Sorter på antall løpere eller lagtid: snittet av klubbens tre beste på distansen.</p>
        </div>

        <div className="ss-filters" style={{ marginTop: 16 }}>
          <nav className="ss-seg" aria-label="Sesong">
            {[now, now - 1, now - 2].map((s) => (
              <Link key={s} href={`/klubber?sesong=${s}`} className={`ss-seg-btn${s === year ? " active" : ""}`} aria-current={s === year ? "page" : undefined}>
                {s}
              </Link>
            ))}
          </nav>
        </div>

        <section className="ss-section" style={{ paddingTop: 24 }}>
          {failed ? (
            <div className="ss-card ss-empty">Kunne ikke laste klubbene akkurat nå.</div>
          ) : clubs.length === 0 ? (
            <div className="ss-card ss-empty">Ingen klubber registrert i {year} ennå.</div>
          ) : (
            <ClubList clubs={clubs} year={year} />
          )}
        </section>
      </div>
    </div>
  );
}
