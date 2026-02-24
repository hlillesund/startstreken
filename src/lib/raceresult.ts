// src/lib/raceresult.ts
import { parseRaceResultList } from "@/lib/raceresult-parse";

export async function fetchRaceResultListRaw(opts: {
  eventId: number;        // 258952
  key: string;            // key=...
  listName: string;       // "Online|Final"
  contest?: number;       // 0
  term?: string;          // ""
  filter?: string;        // f= "10 km" (valgfritt)
  l?: number;             // l=0 i din curl
}) {
  const {
    eventId,
    key,
    listName,
    contest = 0,
    term = "",
    filter = "",
    l = 0,
  } = opts;

  const url = new URL(`https://my1.raceresult.com/${eventId}/RRPublish/data/list`);
  url.searchParams.set("key", key);
  url.searchParams.set("listname", listName);
  url.searchParams.set("page", "results");
  url.searchParams.set("contest", String(contest));
  url.searchParams.set("r", "all");
  url.searchParams.set("l", String(l));
  url.searchParams.set("openedGroups", "{}");
  url.searchParams.set("term", term);
  if (filter) url.searchParams.set("f", filter);

  const res = await fetch(url.toString(), {
    headers: { Accept: "*/*" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`RaceResult failed: ${res.status} ${res.statusText}`);

  // RRPublish = JSON
  return res.text();
}

/**
 * RaceResult har vanligvis ikke paging på samme måte som Ultimate (startrecord),
 * men l=0 + r=all gir som regel alt.
 * Vi lager "AllRaw" likevel, for API-paritet og evt fremtidig paging.
 */
export async function fetchRaceResultListAllRaw(
  eventId: number,
  key: string,
  listName: string,
  contest = 0,
  filter = ""
) {
  const raw = await fetchRaceResultListRaw({
    eventId,
    key,
    listName,
    contest,
    filter,
    l: 0,
  });

  // sanity: hvis parsing gir 0 rader, er ofte listName/contest/filter feil
  const rows = parseRaceResultList(raw);
  if (rows.length === 0) return [raw];

  return [raw];
}