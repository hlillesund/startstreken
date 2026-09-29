import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { findGroup, getLopIndex } from "@/lib/lop/index";
import EditionView from "./EditionView";
import GroupView from "./GroupView";

export const dynamic = "force-dynamic";

type Params = { id: string };
export type LopSearch = { race?: string; d?: string; q?: string; g?: string; p?: string; utover?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const index = await getLopIndex();
  const ev = index.events[id];
  if (ev) {
    return {
      title: `${ev.name} – resultater – Startstreken`,
      description: `Resultatliste, snittider og fordeling av sluttider for ${ev.name}.`,
    };
  }
  const g = UUID.test(id) ? null : findGroup(index, decodeURIComponent(id));
  if (!g) return { title: "Løp – Startstreken" };
  return {
    title: `${g.name} – resultater og statistikk – Startstreken`,
    description: `${g.name}: løyperekorder, snittider for menn og kvinner og alle utgaver${g.eventIds.length > 1 ? ` fra ${g.first?.slice(0, 4)} til ${g.last?.slice(0, 4)}` : ""}.`,
  };
}

export default async function LopDetailPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<LopSearch> }) {
  const [{ id: raw }, sp] = await Promise.all([params, searchParams]);
  const id = decodeURIComponent(raw);
  const index = await getLopIndex();

  if (UUID.test(id)) {
    if (index.events[id]) return <EditionView index={index} eventId={id} sp={sp} />;

    // Links to a race (import log, older pages) → its edition.
    const race = await prisma.races.findUnique({ where: { id }, select: { event_id: true } });
    if (race && index.events[race.event_id]) redirect(`/lop/${race.event_id}?race=${id}`);

    const event = await prisma.events.findUnique({ where: { id: race?.event_id ?? id }, select: { name: true } });
    if (!event) notFound();
    return (
      <div className="ss-page">
        <div className="ss-container">
          <div className="ss-pagehead">
            <Link href="/lop" className="ss-back"><ArrowLeft size={16} /> Alle løp</Link>
            <h1 className="ss-h1">{event.name}</h1>
          </div>
          <div className="ss-card ss-empty" style={{ marginTop: 16 }}>
            Resultatlisten for dette løpet er ikke importert i sin helhet ennå, så vi viser ingen resultater herfra.
          </div>
        </div>
      </div>
    );
  }

  const group = findGroup(index, id);
  if (!group) notFound();
  if (group.slug !== id) redirect(`/lop/${group.slug}${sp.d ? `?d=${encodeURIComponent(sp.d)}` : ""}`);
  return <GroupView index={index} group={group} sp={sp} />;
}
