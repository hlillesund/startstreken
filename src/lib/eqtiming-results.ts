export async function fetchEqTotalResultsPage(args: {
  eventId: number;
  classId: number;
  station?: number | null;
  startAt: number;
  count: number;
  round?: number;
  passes?: boolean;
  justTimeData?: boolean;
  query?: string;
}) {
  const {
    eventId,
    classId,
    station = null,
    startAt,
    count,
    round = 1,
    passes = false,
    justTimeData = true,
    query = "",
  } = args;

  const url =
    `https://live.eqtiming.com/api/Result/Total/${eventId}/${classId}` +
    `?justTimeData=${justTimeData ? "true" : "false"}` +
    `&count=${encodeURIComponent(String(count))}` +
    `&startAt=${encodeURIComponent(String(startAt))}` +
    (station ? `&station=${encodeURIComponent(String(station))}` : "") +
    `&query=${encodeURIComponent(query)}` +
    `&round=${encodeURIComponent(String(round))}` +
    `&passes=${passes ? "true" : "false"}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      "EQLiveLocale": "nb-NO",
      Referer: `https://live.eqtiming.com/${eventId}`,
    },
    cache: "no-store",
  });

  const text = await res.text();

  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}

  if (!res.ok) {
    throw new Error(`EQ Total Results failed: ${res.status} ${res.statusText} body=${text.slice(0, 300)}`);
  }

  return json ?? { _raw: text };
}