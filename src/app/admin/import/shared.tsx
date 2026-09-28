"use client";

export const SOURCES = [
  { slug: "eqtiming", label: "EQ Timing" },
  { slug: "ultimate", label: "Ultimate" },
  { slug: "raceresult", label: "RaceResult" },
  { slug: "racedays", label: "Racedays" },
] as const;

export const CATEGORIES = ["5K", "10K", "HM", "M", "OTHER"] as const;

export function sourceLabel(slug: string) {
  return SOURCES.find((s) => s.slug === slug)?.label ?? slug;
}

/** JSON fetch that surfaces the API's { error } message. */
export async function api<T = Record<string, unknown>>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.href = `/admin/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  if (!res.ok && !(data && typeof data === "object" && "status" in data)) {
    throw new Error((data as { error?: string })?.error ?? `HTTP ${res.status}`);
  }
  return data as T;
}

export function fmtDateTime(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleString("nb-NO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function fmtDuration(ms: number | null | undefined) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

export function fmtNum(n: number | null | undefined) {
  return n == null ? "—" : n.toLocaleString("nb-NO");
}

const STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "Klar", tone: "neutral" },
  waiting: { label: "Venter på resultater", tone: "warn" },
  importing: { label: "Importerer…", tone: "info" },
  imported: { label: "Importert", tone: "ok" },
  ok: { label: "OK", tone: "ok" },
  started: { label: "Kjører", tone: "info" },
  partial: { label: "Delvis", tone: "warn" },
  no_results: { label: "Ingen resultater", tone: "muted" },
  failed: { label: "Feilet", tone: "err" },
  ignored: { label: "Ignorert", tone: "muted" },
};

export function StatusBadge({ status, title }: { status: string; title?: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" };
  return (
    <span className={`imp-badge imp-badge--${s.tone}`} title={title}>
      {s.label}
    </span>
  );
}

const DIST_TONE: Record<string, string> = { "5K": "d5", "10K": "d10", HM: "dhm", M: "dm", OTHER: "dother" };

export function DistBadge({ dist }: { dist: string }) {
  return <span className={`imp-dist imp-dist--${DIST_TONE[dist] ?? "dother"}`}>{dist}</span>;
}

export function Spinner() {
  return <span className="adm-spinner" />;
}
