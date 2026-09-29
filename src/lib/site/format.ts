export type Cat = "5K" | "10K" | "HM" | "M";
export const CATS: Cat[] = ["5K", "10K", "HM", "M"];

export const CAT_LABEL: Record<string, string> = {
  "5K": "5 km",
  "10K": "10 km",
  HM: "Halvmaraton",
  M: "Maraton",
  OTHER: "Annet",
};
export const CAT_SHORT: Record<string, string> = { "5K": "5K", "10K": "10K", HM: "Halv", M: "Maraton", OTHER: "Annet" };
export const CAT_METERS: Record<string, number> = { "5K": 5000, "10K": 10000, HM: 21097.5, M: 42195 };

export function isCat(v: unknown): v is Cat {
  return typeof v === "string" && (CATS as string[]).includes(v);
}

export function formatTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** "+0:42" style gap. */
export function formatGap(ms: number): string {
  return `+${formatTime(Math.abs(ms))}`;
}

export function formatPace(ms: number | null | undefined, cat: string | null | undefined): string | null {
  const meters = cat ? CAT_METERS[cat] : undefined;
  if (!ms || !meters) return null;
  const secPerKm = ms / 1000 / (meters / 1000);
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return s === 60 ? `${m + 1}:00/km` : `${m}:${String(s).padStart(2, "0")}/km`;
}

const MONTHS = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];

export function formatDate(iso: string | null | undefined, opts: { year?: boolean } = {}): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${Number(d)}. ${MONTHS[Number(mo) - 1]}${opts.year === false ? "" : ` ${y}`}`;
}

export function formatNumber(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString("nb-NO");
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function ageFrom(birthYear: number | null | undefined): number | null {
  return birthYear ? new Date().getFullYear() - birthYear : null;
}

export function currentYear(): number {
  return Number(new Intl.DateTimeFormat("en", { timeZone: "Europe/Oslo", year: "numeric" }).format(new Date()));
}

export const GENDER_LABEL: Record<string, string> = { M: "Menn", F: "Kvinner" };
