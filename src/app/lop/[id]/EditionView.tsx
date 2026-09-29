import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDateShort, formatGap, formatPace, formatTime } from "@/components/utovere/utils";
import { CAT_LABEL, type LopIndex } from "@/lib/lop/index";
import { getRaceResults, getRaceSummary, pageOfAthlete, PAGE_SIZE, type Person } from "@/lib/lop/detail";
import FinishHistogram, { type Bins } from "./FinishHistogram";
import ResultSearch, { ScrollIntoView } from "./ResultSearch";
import type { LopSearch } from "./page";

const nf = new Intl.NumberFormat("nb-NO");
const t = (ms: number | null | undefined) => (ms == null ? "—" : formatTime(ms));
const METERS: Record<string, number> = { "5K": 5000, "10K": 10000, HM: 21097.5, M: 42195 };
const STEPS = [30, 60, 120, 300, 600, 900, 1200, 1800, 3600].map((s) => s * 1000);

/** Finish times (sorted) → about 12–24 bars; the few extremes fold into the end bars. */
function toBins(times: number[]): Bins | null {
  if (times.length < 10) return null;
  const q = (p: number) => times[Math.floor(p * (times.length - 1))];
  const lo0 = q(0.01), hi0 = q(0.99);
  const step = STEPS.find((s) => (hi0 - lo0) / s <= 24) ?? STEPS[STEPS.length - 1];
  const lo = Math.floor(lo0 / step) * step;
  const n = Math.max(1, Math.ceil((hi0 + 1 - lo) / step));
  const counts = new Array<number>(n).fill(0);
  for (const t of times) counts[Math.min(n - 1, Math.max(0, Math.floor((t - lo) / step)))]++;
  return { lo, step, counts, openStart: times[0] < lo, openEnd: times[times.length - 1] >= lo + n * step };
}

function Podium({ title, people, winner }: { title: string; people: Person[]; winner: number | null }) {
  return (
    <div className="ss-lb-col">
      <div className="ss-lb-col-title" style={{ display: "block" }}>{title}</div>
      {people.length === 0 ? (
        <div className="ss-empty" style={{ padding: "12px 16px" }}>Ingen</div>
      ) : (
        <ol className="ss-lb-list">
          {people.map((p, i) => (
            <li key={p.athleteId}>
              <Link href={`/utovere?athleteId=${p.athleteId}`} className="ss-lb-row">
                <span className={`ss-rank ss-rank--${i + 1}`}>{i + 1}</span>
                <span className="ss-lb-body">
                  <span className="ss-lb-name" style={{ display: "block" }}>{p.name}</span>
                  <span className="ss-lb-meta" style={{ display: "block" }}>{[p.birthYear, p.club].filter(Boolean).join(" · ") || " "}</span>
                </span>
                <span style={{ textAlign: "right" }}>
                  <span className="ss-lb-time" style={{ display: "block" }}>{formatTime(p.timeMs)}</span>
                  {i > 0 && winner != null && <span className="ss-lb-meta" style={{ display: "block" }}>{formatGap(p.timeMs - winner)}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default async function EditionView({ index, eventId, sp }: { index: LopIndex; eventId: string; sp: LopSearch }) {
  const ev = index.events[eventId];
  const group = index.groups.find((g) => g.slug === index.groupOf[eventId])!;
  const race = ev.races.find((r) => r.id === sp.race) ?? ev.races[0];
  const gender = sp.g === "M" || sp.g === "F" ? sp.g : null;
  const q = sp.q?.trim() ?? "";
  const highlight = sp.utover ?? null;

  let page = Math.max(1, Number.parseInt(sp.p ?? "", 10) || 1);
  if (highlight && !sp.p && !q && !gender) page = (await pageOfAthlete(race.id, highlight)) ?? 1;

  const [summary, results] = await Promise.all([getRaceSummary(race), getRaceResults({ raceId: race.id, q, gender, page })]);
  const pages = Math.max(1, Math.ceil(results.total / PAGE_SIZE));
  const meters = METERS[race.cat] ?? null;
  const bins = toBins(summary.times);
  const winnerTime = summary.best;
  const hlTime = highlight ? results.rows.find((r) => r.athleteId === highlight)?.timeMs ?? null : null;
  const others = group.eventIds.filter((id) => id !== eventId).map((id) => index.events[id]);

  const href = (patch: Partial<Record<keyof LopSearch, string | null>>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | null | undefined> = { race: sp.race, q: sp.q, g: sp.g, p: sp.p, utover: sp.utover, ...patch };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    const s = p.toString();
    return `/lop/${eventId}${s ? `?${s}` : ""}`;
  };

  return (
    <div className="ss-page">
      <div className="ss-container">
        <div className="ss-pagehead">
          <Link href={`/lop/${group.slug}`} className="ss-back">
            <ArrowLeft size={16} /> {group.eventIds.length > 1 ? `Alle utgaver av ${group.name}` : "Alle løp"}
          </Link>
          <div className="ss-eyebrow">{[formatDateShort(ev.date), ev.location].filter((x) => x && x !== "—").join(" · ")}</div>
          <h1 className="ss-h1" style={{ marginTop: 6 }}>{ev.name}</h1>
          <p className="ss-sub">
            {nf.format(ev.finishers)} fullførte{ev.races.length > 1 ? ` fordelt på ${ev.races.length} løp` : ""}
          </p>
        </div>

        {ev.races.length > 1 && (
          <nav className="ss-chips" aria-label="Løp" style={{ marginTop: 14 }}>
            {ev.races.map((r) => (
              <Link
                key={r.id}
                href={`/lop/${eventId}?race=${r.id}`}
                className={`ss-chip${r.id === race.id ? " active" : ""}`}
                aria-current={r.id === race.id ? "page" : undefined}
              >
                {r.name} <span style={{ opacity: 0.6 }}>{nf.format(r.total)}</span>
              </Link>
            ))}
          </nav>
        )}

        <section className="ss-section" style={{ paddingTop: 16 }}>
          <div className="ss-card ss-kpis">
            <div className="ss-kpi">
              <div className="ss-kpi-label">Fullførte</div>
              <div className="ss-kpi-val">{nf.format(summary.n)}</div>
              <div className="ss-kpi-hint">{nf.format(summary.nM)} menn · {nf.format(summary.nF)} kvinner</div>
            </div>
            <div className="ss-kpi">
              <div className="ss-kpi-label">Snittid</div>
              <div className="ss-kpi-val">{t(summary.avg)}</div>
              <div className="ss-kpi-hint">
                {[meters ? formatPace(summary.avg, meters) : race.cat === "OTHER" ? race.name : CAT_LABEL[race.cat], summary.median ? `median ${t(summary.median)}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <div className="ss-kpi">
              <div className="ss-kpi-label">Snitt menn</div>
              <div className="ss-kpi-val">{t(summary.avgM)}</div>
              <div className="ss-kpi-hint">{summary.podiumM[0] ? `Vinner ${formatTime(summary.podiumM[0].timeMs)}` : "—"}</div>
            </div>
            <div className="ss-kpi">
              <div className="ss-kpi-label">Snitt kvinner</div>
              <div className="ss-kpi-val">{t(summary.avgF)}</div>
              <div className="ss-kpi-hint">{summary.podiumF[0] ? `Vinner ${formatTime(summary.podiumF[0].timeMs)}` : "—"}</div>
            </div>
          </div>

          <div className="ss-grid-2" style={{ marginTop: 12 }}>
            <div className="ss-card ss-card-pad">
              <h2 className="ss-h3">Fordeling av sluttider</h2>
              <p className="ss-sub" style={{ marginBottom: 12 }}>Antall løpere per tidsintervall{hlTime ? " – din tid er markert" : ""}.</p>
              {bins ? <FinishHistogram bins={bins} total={summary.n} median={summary.median} highlight={hlTime} /> : <div className="ss-empty">For få resultater.</div>}
            </div>
            <div className="ss-card">
              <div className="ss-lb-head"><h2 className="ss-h3">Pallen</h2></div>
              <div className="ss-lb-cols ss-lb-cols--stack">
                <Podium title="Menn" people={summary.podiumM} winner={summary.podiumM[0]?.timeMs ?? null} />
                <Podium title="Kvinner" people={summary.podiumF} winner={summary.podiumF[0]?.timeMs ?? null} />
              </div>
            </div>
          </div>
        </section>

        <section className="ss-card" id="resultater" style={{ marginBottom: 24 }}>
          <div className="ss-toolbar">
            <h2 className="ss-h3">
              Resultater
              <span className="ss-muted" style={{ fontWeight: 500 }}> · {nf.format(results.total)}</span>
            </h2>
            <div className="ss-filters">
              <ResultSearch initial={q} />
              <nav className="ss-seg" aria-label="Kjønn">
                {([null, "M", "F"] as const).map((g) => (
                  <Link key={g ?? "all"} href={href({ g, p: null })} className={`ss-seg-btn${gender === g ? " active" : ""}`} scroll={false}>
                    {g === "M" ? "Menn" : g === "F" ? "Kvinner" : "Alle"}
                  </Link>
                ))}
              </nav>
            </div>
          </div>

          {results.rows.length === 0 ? (
            <div className="ss-empty">{q ? `Ingen treff på «${q}».` : "Ingen resultater."}</div>
          ) : (
            <ol className="ss-rank-table">
              {results.rows.map((r) => {
                const genderPlace = r.rankGender ? `${r.rankGender}. ${r.gender === "F" ? "kvinne" : "mann"}` : null;
                return (
                  <li key={`${r.athleteId}-${r.timeMs}`}>
                    <Link
                      href={`/utovere?athleteId=${r.athleteId}`}
                      className={`ss-rank-row ss-res-row${r.athleteId === highlight ? " is-me" : ""}`}
                      id={r.athleteId === highlight ? "meg" : undefined}
                    >
                      <span className={`ss-rank${r.rank && r.rank <= 3 ? ` ss-rank--${r.rank}` : ""}`}>{r.rank ?? "–"}</span>
                      <span style={{ minWidth: 0 }}>
                        <span className="ss-lb-name" style={{ display: "block" }}>
                          {r.name}
                          {r.para && <span className="ss-badge" style={{ marginLeft: 6 }}>Para</span>}
                        </span>
                        <span className="ss-lb-meta" style={{ display: "block" }}>
                          {[r.birthYear, r.club, genderPlace].filter(Boolean).join(" · ") || " "}
                        </span>
                      </span>
                      <span style={{ textAlign: "right" }}>
                        <span className="ss-lb-time" style={{ display: "block" }}>{formatTime(r.timeMs)}</span>
                        <span className="ss-lb-meta" style={{ display: "block" }}>
                          {winnerTime != null && r.timeMs > winnerTime ? formatGap(r.timeMs - winnerTime) : meters ? formatPace(r.timeMs, meters) : " "}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}

          {pages > 1 && (
            <div className="ss-pager">
              {page > 1 ? (
                <Link href={href({ p: String(page - 1) })} className="ss-btn ss-btn--sm" scroll={false}><ChevronLeft size={16} /> Forrige</Link>
              ) : <span />}
              <span className="ss-muted" style={{ fontSize: 13 }}>
                {nf.format((page - 1) * PAGE_SIZE + 1)}–{nf.format(Math.min(page * PAGE_SIZE, results.total))} av {nf.format(results.total)}
              </span>
              {page < pages ? (
                <Link href={href({ p: String(page + 1) })} className="ss-btn ss-btn--sm" scroll={false}>Neste <ChevronRight size={16} /></Link>
              ) : <span />}
            </div>
          )}
        </section>

        {others.length > 0 && (
          <section className="ss-section" style={{ paddingTop: 0 }}>
            <div className="ss-section-head">
              <h2 className="ss-h2">Andre utgaver</h2>
              <Link href={`/lop/${group.slug}`} className="ss-link">Statistikk for alle år <ChevronRight size={16} /></Link>
            </div>
            <div className="ss-chips" style={{ flexWrap: "wrap" }}>
              {others.map((o) => (
                <Link key={o.id} href={`/lop/${o.id}`} className="ss-chip" title={o.name}>
                  {o.date?.slice(0, 4) ?? o.name}
                  {others.some((x) => x !== o && x.date?.slice(0, 4) === o.date?.slice(0, 4)) ? ` · ${formatDateShort(o.date).replace(/ \d{4}$/, "")}` : ""}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
      {highlight && hlTime != null && <ScrollIntoView id="meg" />}
    </div>
  );
}
