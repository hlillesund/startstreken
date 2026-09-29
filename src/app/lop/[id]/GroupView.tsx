import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { formatDateShort, formatPace, formatTime } from "@/components/utovere/utils";
import type { LopGroup, LopIndex } from "@/lib/lop/index";
import { getGroupCourse, type Person } from "@/lib/lop/detail";
import YearTrend from "./YearTrend";
import type { LopSearch } from "./page";

const nf = new Intl.NumberFormat("nb-NO");
const METERS: Record<string, number> = { "5K": 5000, "10K": 10000, HM: 21097.5, M: 42195 };
const t = (ms: number | null | undefined) => (ms == null ? "—" : formatTime(ms));
const year = (d: string | null) => d?.slice(0, 4) ?? "—";

function TopList({ title, people }: { title: string; people: (Person & { event: { id: string; date: string | null } })[] }) {
  return (
    <section className="ss-card">
      <div className="ss-lb-head"><h2 className="ss-h3">{title}</h2></div>
      {people.length === 0 ? (
        <div className="ss-empty">Ingen resultater.</div>
      ) : (
        <ol className="ss-lb-list">
          {people.map((p, i) => (
            <li key={p.athleteId}>
              <Link href={`/utovere?athleteId=${p.athleteId}`} className="ss-lb-row">
                <span className={`ss-rank${i < 3 ? ` ss-rank--${i + 1}` : ""}`}>{i + 1}</span>
                <span className="ss-lb-body">
                  <span className="ss-lb-name" style={{ display: "block" }}>{p.name}</span>
                  <span className="ss-lb-meta" style={{ display: "block" }}>{[year(p.event.date), p.club].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="ss-lb-time">{formatTime(p.timeMs)}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default async function GroupView({ index, group, sp }: { index: LopIndex; group: LopGroup; sp: LopSearch }) {
  const courses = group.courses;
  const main = courses.filter((c) => c.cat !== "OTHER");
  const fallback = (main.length ? main : courses).reduce((a, b) => (b.n > a.n ? b : a));
  const course = courses.find((c) => c.key === sp.d) ?? fallback;
  // Tiny side classes (officials, kids) stay out of the tabs unless selected.
  const tabs = courses.filter((c) => c === course || c.n >= 10 || c.cat !== "OTHER");
  const detail = await getGroupCourse(index, group, course.key);
  if (!detail) return null;

  const meters = METERS[course.cat] ?? null;
  const recM = detail.topM[0] ?? null;
  const recF = detail.topF[0] ?? null;
  const trend = detail.editions
    .filter((e) => e.event.date)
    .map((e) => ({ date: e.event.date!, name: e.event.name, avgM: e.avgM, avgF: e.avgF }))
    .reverse();
  const years = group.first && group.last ? (year(group.first) === year(group.last) ? year(group.first) : `${year(group.first)}–${year(group.last)}`) : null;
  const q = (key: string) => `/lop/${group.slug}${key === fallback.key ? "" : `?d=${encodeURIComponent(key)}`}`;

  return (
    <div className="ss-page">
      <div className="ss-container">
        <div className="ss-pagehead">
          <Link href="/lop" className="ss-back"><ArrowLeft size={16} /> Alle løp</Link>
          <div className="ss-eyebrow">{[group.location, years].filter(Boolean).join(" · ")}</div>
          <h1 className="ss-h1" style={{ marginTop: 6 }}>{group.name}</h1>
          <p className="ss-sub">
            {group.eventIds.length} {group.eventIds.length === 1 ? "utgave" : "utgaver"} · {nf.format(group.finishers)} fullførte totalt
          </p>
        </div>

        {tabs.length > 1 && (
          <nav className="ss-chips" aria-label="Distanse" style={{ marginTop: 14 }}>
            {tabs.map((c) => (
              <Link key={c.key} href={q(c.key)} className={`ss-chip${c.key === course.key ? " active" : ""}`} aria-current={c.key === course.key ? "page" : undefined}>
                {c.label} <span style={{ opacity: 0.6 }}>{nf.format(c.n)}</span>
              </Link>
            ))}
          </nav>
        )}

        <section className="ss-section" style={{ paddingTop: 16 }}>
          <div className="ss-card ss-kpis">
            <div className="ss-kpi">
              <div className="ss-kpi-label">Løyperekord menn</div>
              <div className="ss-kpi-val">{t(recM?.timeMs)}</div>
              <div className="ss-kpi-hint">{recM ? `${recM.name} · ${year(recM.event.date)}` : "—"}</div>
            </div>
            <div className="ss-kpi">
              <div className="ss-kpi-label">Løyperekord kvinner</div>
              <div className="ss-kpi-val">{t(recF?.timeMs)}</div>
              <div className="ss-kpi-hint">{recF ? `${recF.name} · ${year(recF.event.date)}` : "—"}</div>
            </div>
            <div className="ss-kpi">
              <div className="ss-kpi-label">Snittid, alle år</div>
              <div className="ss-kpi-val">{t(course.avg)}</div>
              <div className="ss-kpi-hint">Menn {t(course.avgM)} · kvinner {t(course.avgF)}</div>
            </div>
            <div className="ss-kpi">
              <div className="ss-kpi-label">Fullførte</div>
              <div className="ss-kpi-val">{nf.format(course.n)}</div>
              <div className="ss-kpi-hint">{nf.format(course.nM)} menn · {nf.format(course.nF)} kvinner</div>
            </div>
          </div>

          {trend.length > 1 && (
            <div className="ss-card ss-card-pad" style={{ marginTop: 12 }}>
              <h2 className="ss-h3">Snittid per utgave</h2>
              <p className="ss-sub" style={{ marginBottom: 12 }}>Lavere er raskere{meters ? "" : ` · ${course.label}`}.</p>
              <YearTrend points={trend} />
            </div>
          )}
        </section>

        <section className="ss-card">
          <div className="ss-toolbar">
            <h2 className="ss-h3">
              Utgaver <span className="ss-muted" style={{ fontWeight: 500 }}>· {course.label}</span>
            </h2>
          </div>
          <div className="ss-table-wrap">
            <table className="ss-table ss-ed-table">
              <thead>
                <tr>
                  <th>Utgave</th>
                  <th className="r">Fullførte</th>
                  <th className="r">Snitt</th>
                  <th className="r ss-hide-sm">Menn</th>
                  <th className="r ss-hide-sm">Kvinner</th>
                  <th className="ss-hide-sm">Vinner menn</th>
                  <th className="ss-hide-sm">Vinner kvinner</th>
                </tr>
              </thead>
              <tbody>
                {detail.editions.map((e) => (
                  <tr key={e.event.id}>
                    <td>
                      <Link href={`/lop/${e.event.id}?race=${e.raceId}`} className="ss-ed-link">
                        <b>{year(e.event.date)}</b>
                        <span className="ss-muted">{formatDateShort(e.event.date).replace(/ \d{4}$/, "")}</span>
                      </Link>
                    </td>
                    <td className="r">{nf.format(e.n)}</td>
                    <td className="r">
                      {t(e.avg)}
                      {meters && <span className="ss-ed-sub">{formatPace(e.avg, meters)}</span>}
                    </td>
                    <td className="r ss-hide-sm">{t(e.avgM)}</td>
                    <td className="r ss-hide-sm">{t(e.avgF)}</td>
                    <td className="ss-hide-sm">
                      {e.winnerM ? (
                        <Link href={`/utovere?athleteId=${e.winnerM.athleteId}`} className="ss-ed-winner">
                          {formatTime(e.winnerM.timeMs)} <span className="ss-muted">{e.winnerM.name}</span>
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="ss-hide-sm">
                      {e.winnerF ? (
                        <Link href={`/utovere?athleteId=${e.winnerF.athleteId}`} className="ss-ed-winner">
                          {formatTime(e.winnerF.timeMs)} <span className="ss-muted">{e.winnerF.name}</span>
                        </Link>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="ss-section">
          <div className="ss-section-head">
            <div>
              <h2 className="ss-h2">Raskeste gjennom tidene</h2>
              <p className="ss-sub">Beste tid per løper, {course.label.toLowerCase()}.</p>
            </div>
          </div>
          <div className="ss-cmp-dists">
            <TopList title="Menn" people={detail.topM} />
            <TopList title="Kvinner" people={detail.topF} />
          </div>
        </section>

        {detail.regulars.length > 0 && (
          <section className="ss-section" style={{ paddingTop: 0 }}>
            <div className="ss-card">
              <div className="ss-lb-head"><h2 className="ss-h3">Flest fullføringer</h2></div>
              <ol className="ss-lb-list">
                {detail.regulars.map((r) => (
                  <li key={r.athleteId}>
                    <Link href={`/utovere?athleteId=${r.athleteId}`} className="ss-lb-row">
                      <span className="ss-lb-body">
                        <span className="ss-lb-name" style={{ display: "block" }}>{r.name}</span>
                        <span className="ss-lb-meta" style={{ display: "block" }}>Beste tid {formatTime(r.best)}</span>
                      </span>
                      <span className="ss-lb-time">{r.count}×</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
