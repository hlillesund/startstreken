import { prisma } from "@/lib/prisma";
import { formatTime } from "@/components/utovere/utils";
import Link from "next/link";

const LABELS: Record<string, string> = { "5K": "5K", "10K": "10K", HM: "Halvmaraton", M: "Maraton" };
const ALLOWED = new Set(["5K", "10K", "HM", "M"]);

type Row = { athlete_id: string; display_name: string; gender: string; best_time_ms: bigint; rank: bigint };

export default async function Topp100Page({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; year?: string }>;
}) {
  const params = await searchParams;
  const category = ALLOWED.has(params.category ?? "") ? params.category! : "HM";
  const year = Number(params.year ?? new Date().getFullYear());
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));

  const rows = await prisma.$queryRaw<Row[]>`
    WITH best AS (
      SELECT
        r.athlete_id,
        a.display_name,
        a.gender,
        MIN(r.time_ms) AS best_time_ms
      FROM results r
      JOIN races ra ON ra.id = r.race_id
      JOIN events e ON e.id = ra.event_id
      JOIN athletes a ON a.id = r.athlete_id
      WHERE r.distance_category = ${category}
        AND e.start_date >= ${from}
        AND e.start_date < ${to}
        AND a.gender IN ('M', 'F')
      GROUP BY r.athlete_id, a.display_name, a.gender
    ),
    ranked AS (
      SELECT *,
        DENSE_RANK() OVER (PARTITION BY gender ORDER BY best_time_ms ASC) AS rank
      FROM best
    )
    SELECT athlete_id::text, display_name, gender, best_time_ms::bigint, rank
    FROM ranked
    WHERE rank <= 100
    ORDER BY gender, rank;
  `;

  const mens = rows.filter((r) => r.gender === "M");
  const womens = rows.filter((r) => r.gender === "F");
  const CATEGORIES = ["5K", "10K", "HM", "M"];

  return (
    <div className="cpn-root" style={{ paddingTop: "var(--topnav-h)" }}>
      <header className="cpn-header">
        <span className="cpn-logo">Løpsresultater</span>
        <span className="cpn-header-right">{year} Season</span>
      </header>

      <div className="cpn-hero">
        <div>
          <div className="cpn-hero-eyebrow">Toppliste / {year}</div>
          <h1 className="cpn-hero-title">Topp 100 — {LABELS[category]}</h1>
        </div>
        <Link href="/utovere" className="cpn-back">&larr; Tilbake</Link>
      </div>

      <div style={{ padding: "0 24px 16px" }}>
        <div className="cpn-tabs">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat}
              href={`/utovere/topp100?category=${cat}&year=${year}`}
              className={`cpn-tab${category === cat ? " active" : ""}`}
            >
              {cat === "HM" ? "HM" : cat === "M" ? "MAR" : cat}
            </Link>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, padding: "0 24px 48px" }}>
        {(["M", "F"] as const).map((gender) => {
          const list = gender === "M" ? mens : womens;
          return (
            <div key={gender}>
              <div className="cpn-section-label">{gender === "M" ? "🏃 Herrer" : "🏃‍♀️ Damer"}</div>
              <div className="cpn-table">
                <div className="cpn-table-head">
                  <div className="cpn-th" style={{ width: 40 }}>#</div>
                  <div className="cpn-th">Navn</div>
                  <div className="cpn-th" style={{ textAlign: "right" }}>Tid</div>
                </div>
                {list.map((row) => (
                  <Link
                    key={row.athlete_id}
                    href={`/utovere?athleteId=${row.athlete_id}`}
                    className="cpn-tr"
                    style={{ display: "grid", gridTemplateColumns: "40px 1fr auto", textDecoration: "none" }}
                  >
                    <div className="cpn-td" style={{ color: "#888" }}>{Number(row.rank)}</div>
                    <div className="cpn-td">{row.display_name}</div>
                    <div className="cpn-td">
                      <span className="cpn-time">{formatTime(Number(row.best_time_ms))}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}