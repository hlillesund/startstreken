export function formatTime(ms: number) {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export const MAIN_DISTANCES = [
  { key: "5K", label: "5 km", short: "5K", long: "5 kilometer", meters: 5000 },
  { key: "10K", label: "10 km", short: "10K", long: "10 kilometer", meters: 10000 },
  { key: "HM", label: "Halvmaraton", short: "Halv", long: "Halvmaraton", meters: 21097.5 },
  { key: "M", label: "Maraton", short: "Maraton", long: "Maraton", meters: 42195 },
] as const;

export type MainDistance = (typeof MAIN_DISTANCES)[number]["key"];

export function distanceLabel(cat: string | null | undefined) {
  return MAIN_DISTANCES.find((d) => d.key === cat)?.label ?? "Annet";
}

export function distanceMeters(cat: string | null | undefined) {
  return MAIN_DISTANCES.find((d) => d.key === cat)?.meters ?? null;
}

/** Pace in min/km, e.g. "4:05/km". */
export function formatPace(ms: number | null | undefined, meters: number | null | undefined) {
  if (!ms || !meters) return null;
  const secPerKm = Math.round(ms / 1000 / (meters / 1000));
  return `${Math.floor(secPerKm / 60)}:${String(secPerKm % 60).padStart(2, "0")}/km`;
}

/** Gap between two times, e.g. "+0:23". */
export function formatGap(ms: number) {
  return `${ms < 0 ? "−" : "+"}${formatTime(Math.abs(ms))}`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

const MONTHS = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];

export function formatDateShort(dateStr: string | null) {
  const m = dateStr?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "—";
  return `${Number(m[3])}. ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

export function dateParts(dateStr: string | null) {
  const m = dateStr?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { day: Number(m[3]), month: MONTHS[Number(m[2]) - 1], year: Number(m[1]) };
}

export function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr;
  const [, y, mo, d] = m;
  return `${d}.${mo}.${y}`;
}

export function mostCommon(values: (string | null | undefined)[]) {
  const map = new Map<string, number>();
  for (const v of values) {
    if (v) map.set(v, (map.get(v) ?? 0) + 1);
  }
  let best: string | null = null,
    max = 0;
  for (const [k, n] of map) {
    if (n > max) {
      best = k;
      max = n;
    }
  }
  return best;
}

export function median(values: number[]) {
  if (!values.length) return null;
  const arr = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 === 0 ? Math.round((arr[mid - 1] + arr[mid]) / 2) : arr[mid];
}

export function mean(values: number[]) {
  if (!values.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export function pctChange(newer: number, older: number) {
  if (!Number.isFinite(newer) || !Number.isFinite(older) || older === 0) return null;
  return ((newer - older) / older) * 100;
}

export function yearFromDate(dateStr: string | null) {
  if (!dateStr) return null;
  const m = dateStr.match(/^(\d{4})-/);
  return m ? Number(m[1]) : null;
}

export function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function scoreHit(query: string, name: string) {
  const q = norm(query),
    n = norm(name);
  if (!q) return 0;
  if (n === q) return 1000;
  if (n.startsWith(q)) return 850;
  const qT = q.split(" ").filter(Boolean),
    nSet = new Set(n.split(" ").filter(Boolean));
  if (qT.every((t) => nSet.has(t))) return 700 + qT.length * 10;
  const ov = qT.filter((t) => nSet.has(t)).length;
  if (ov > 0) return 300 + ov * 20;
  if (n.includes(q)) return 250;
  return 0;
}