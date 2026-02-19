export async function fetchEqStartlistPage(eventId: number, startAt: number, count: number) {
  const url =
    `https://live.eqtiming.com/api/Startlist/${eventId}/0` +
    `?startAt=${startAt}&query=&filter=&sortcols=&count=${count}`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "EQLiveLocale": "nb-NO",
      // prøv å emulere det nettleseren din gjør:
      Referer: `https://live.eqtiming.com/${eventId}`,
    },
    cache: "no-store",
  });

  const text = await res.text();

  // Prøv JSON parse uansett
  let json: any = null;
  try { json = JSON.parse(text); } catch {}

  if (!res.ok) {
    throw new Error(`Startlist failed: ${res.status} ${res.statusText} body=${text.slice(0, 300)}`);
  }

  // Returner JSON hvis mulig, ellers tekst (for debug)
  return json ?? { _raw: text };
}