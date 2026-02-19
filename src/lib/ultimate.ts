export async function fetchUltimateResultsRaw(eventId: number, distance: number, language = "us") {
  const url =
    `https://live.ultimate.dk/desktop/front/data.php?` +
    `eventid=${eventId}&mode=results&distance=${distance}&category=&language=${language}`;

  const res = await fetch(url, { headers: { Accept: "*/*" }, cache: "no-store" });
  if (!res.ok) throw new Error(`Ultimate failed: ${res.status} ${res.statusText}`);

  return res.text();
}