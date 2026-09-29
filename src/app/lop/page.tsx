import type { Metadata } from "next";
import { getLopIndex, MAIN_CATS } from "@/lib/lop/index";
import LopBrowser, { type GroupItem, type LatestItem } from "./LopBrowser";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Løp – resultater, snittider og løyperekorder – Startstreken",
  description: "Alle løp med fullstendige resultatlister: snittid for menn og kvinner, løyperekorder og utvikling år for år.",
};

type Search = { q?: string; d?: string; s?: string };

export default async function LopPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const index = await getLopIndex();

  const groups: GroupItem[] = index.groups.map((g) => ({
    slug: g.slug,
    name: g.name,
    location: g.location,
    first: g.first,
    last: g.last,
    editions: g.eventIds.length,
    finishers: g.finishers,
    courses: g.courses
      .filter((c) => (MAIN_CATS as readonly string[]).includes(c.cat))
      .map((c) => ({ cat: c.cat, n: c.n, avg: c.avg, avgM: c.avgM, avgF: c.avgF })),
    other: g.courses.some((c) => c.cat === "OTHER"),
  }));

  const latest: LatestItem[] = Object.values(index.events)
    .filter((e) => e.date && e.finishers >= 20)
    .sort((a, b) => b.date!.localeCompare(a.date!))
    .slice(0, 8)
    .map((e) => ({ id: e.id, name: index.groups.find((g) => g.slug === index.groupOf[e.id])?.name ?? e.name, date: e.date, finishers: e.finishers }));

  return (
    <div className="ss-page">
      <LopBrowser
        groups={groups}
        latest={latest}
        initial={{ q: sp.q ?? "", d: sp.d ?? "", s: sp.s ?? "" }}
        totals={{ editions: Object.keys(index.events).length, results: groups.reduce((t, g) => t + g.finishers, 0) }}
      />
    </div>
  );
}
