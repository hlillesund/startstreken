import crypto from "crypto";
import { decode } from "html-entities";

/* ── Names ──────────────────────────────────────────────────────────────── */

/** "Last, First Middle" → "First Middle Last"; strips punctuation that differs between sources. */
export function canonicalName(name: string): string {
  let s = (name ?? "").normalize("NFC").trim();
  const m = s.match(/^([^,]+),\s*(.+)$/);
  if (m) s = `${m[2].trim()} ${m[1].trim()}`;
  return s.replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * The key stored in athletes.display_name_norm (unique). Every importer must use
 * this so the same person maps to the same row regardless of source.
 */
export function normName(name: string): string {
  return canonicalName(name).toLowerCase();
}

/**
 * Display form: "Last, First" is flipped and words written in ALL CAPS are
 * title-cased ("NYSTUEN, Tomas" → "Tomas Nystuen"). Other punctuation is kept.
 */
export function prettyName(name: string): string {
  let s = (name ?? "").normalize("NFC").trim();
  const m = s.match(/^([^,]+),\s*(.+)$/);
  if (m) s = `${m[2].trim()} ${m[1].trim()}`;
  return s
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) =>
      word.length > 1 && word === word.toUpperCase() && word !== word.toLowerCase()
        ? word
            .toLowerCase()
            .replace(/(^|[-'’])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())
        : word
    )
    .join(" ");
}

/** Normalised race key, e.g. "Halvmaraton " → "halvmaraton". */
export function normKey(s: string): string {
  return (s ?? "").normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
}

export function shortHash(s: string): string {
  return crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);
}

/**
 * Person id for sources without stable participant ids. The formula matches the
 * previous Ultimate/RaceResult importers so existing identities keep matching.
 */
export function syntheticPersonId(name: string, club?: string | null, category?: string | null): string {
  return `synt:${shortHash(`${name}|${club ?? ""}|${category ?? ""}`)}`;
}

export function cleanStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/ /g, " ").trim();
  return s.length ? s : null;
}

/* ── Times ──────────────────────────────────────────────────────────────── */

/** Longer than any real race (multi-day ultras included) — beyond this it's junk. */
export const MAX_TIME_MS = 10 * 86_400_000;
/** Parser ceiling; larger values may still be day-offset glitches fixed per race (see fixDayOffset). */
const PARSE_LIMIT_MS = 400 * 86_400_000;

/**
 * Parses finishing times into whole-second milliseconds (fractions are dropped, as
 * before). Accepts "1:02:03", "32:06", "1:16:51,3", "39:03.0", "1d 02:03:04",
 * "01h02m03s". Returns null for statuses (DNF/DNS/DSQ), gaps ("+3:05") and junk.
 */
export function parseTimeMs(input: unknown): number | null {
  const raw = cleanStr(input);
  if (!raw) return null;
  let s = raw.toLowerCase();
  if (s.startsWith("+") || s.startsWith("-")) return null;

  let days = 0;
  const d = s.match(/^(\d+)\s*d(?:ays?)?\s+(.*)$/);
  if (d) {
    days = Number(d[1]);
    s = d[2];
  }

  const hms = s.match(/^(?:(\d+)\s*[ht]\s*)?(\d+)\s*m(?:in)?\s*(\d+)(?:[.,]\d+)?\s*s?$/);
  let h = 0,
    m = 0,
    sec = 0;
  if (hms) {
    h = Number(hms[1] ?? 0);
    m = Number(hms[2]);
    sec = Number(hms[3]);
  } else {
    const plain = s.replace(/[.,]\d+$/, "");
    if (!/^\d+(:\d{1,2}){1,2}$/.test(plain)) return null;
    const parts = plain.split(":").map(Number);
    if (parts.length === 3) [h, m, sec] = parts;
    else [m, sec] = parts;
  }
  if (m >= 60 && h > 0) return null;
  if (sec >= 60) return null;

  const ms = ((days * 24 + h) * 3600 + m * 60 + sec) * 1000;
  return ms > 0 && ms <= PARSE_LIMIT_MS ? ms : null;
}

/* ── HTML / CSV ─────────────────────────────────────────────────────────── */

export function stripTags(html: string): string {
  const text = html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[^>]+>/g, "")
    .trim();
  return decode(text).replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

export function decodeEntities(s: string): string {
  return decode(s ?? "");
}

/** RFC-4180-ish parser with a configurable delimiter (EQ reports use ";"). */
export function parseCsv(text: string, delimiter = ";"): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");

  const pushCell = () => {
    cur.push(cell);
    cell = "";
  };
  const pushRow = () => {
    if (cur.length > 1 || (cur.length === 1 && cur[0].trim() !== "")) rows.push(cur);
    cur = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === delimiter) pushCell();
    else if (ch === "\n") {
      pushCell();
      pushRow();
    } else if (ch !== "\r") cell += ch;
  }
  pushCell();
  pushRow();
  return rows;
}

/* ── Dates ──────────────────────────────────────────────────────────────── */

/** "YYYY-MM-DD" (or an ISO timestamp) → Date at UTC midnight, for @db.Date columns. */
export function toDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function isoDate(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Today's date in Norway as YYYY-MM-DD. */
export function osloToday(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(new Date());
}

/**
 * How display_name_norm was computed by the old EQ/Ultimate importers (lowercase,
 * punctuation kept). "Last, First" is flipped first so other sources can match it.
 */
export function legacyNormName(name: string): string {
  let s = (name ?? "").normalize("NFC").trim();
  const m = s.match(/^([^,]+),\s*(.+)$/);
  if (m) s = `${m[2].trim()} ${m[1].trim()}`;
  return s.toLowerCase().replace(/\s+/g, " ");
}

/**
 * Timing systems with a wrongly set start date report every time with the same
 * whole-day offset (seen at EQ: "8736:40:09" = 364 days + 40:09). If all times in
 * a race are over a day and lie within one day of each other, strip the offset.
 */
export function fixDayOffset(times: number[]): number {
  if (!times.length) return 0;
  const DAY = 86_400_000;
  const min = Math.min(...times);
  const max = Math.max(...times);
  if (min < DAY || max - min >= DAY) return 0;
  const offset = Math.floor(min / DAY) * DAY;
  return max - offset < DAY ? offset : 0;
}
