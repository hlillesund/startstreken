import type { Metadata } from "next";
import { getLopList } from "@/lib/lop/snapshot";
import LopBrowser, { type GroupItem, type LatestItem } from "./LopBrowser";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Løp – resultater, snittider og løyperekorder – Startstreken",
  description: "Alle løp med fullstendige resultatlister: snittid for menn og kvinner, løyperekorder og utvikling år for år.",
};

type Search = { q?: string; d?: string; s?: string };

export default async function LopPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [sp, list] = await Promise.all([searchParams, getLopList()]);
  const groups: GroupItem[] = list.groups;
  const latest: LatestItem[] = list.latest;

  return (
    <div className="ss-page">
      <LopBrowser groups={groups} latest={latest} initial={{ q: sp.q ?? "", d: sp.d ?? "", s: sp.s ?? "" }} totals={list.totals} />
    </div>
  );
}
