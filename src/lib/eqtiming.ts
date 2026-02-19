export async function fetchEqParticipantResults(uid: string) {
  const url = `https://live.eqtiming.com/api/Participant/Results?id=${encodeURIComponent(uid)}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`EQTiming failed: ${res.status} ${res.statusText}`);
  }

  return res.json();
}