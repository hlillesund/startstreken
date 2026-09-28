export type DistanceCategory = "5K" | "10K" | "HM" | "M" | "OTHER";

// History: bruker EtappeNavn (eller annen EQ-feltstruktur)
export function classifyEqDistanceCategoryFromItem(item: any): DistanceCategory | null {
  const et = String(item?.EtappeNavn ?? "").toLowerCase();

  if (et.includes("halv") || et.includes("half")) return "HM";
  if (et.includes("maraton") || et.includes("marathon")) return "M";

  if (/\b10\s*(km|k)\b/.test(et) || et.includes("10km") || et.includes("10 km")) return "10K";
  if (/\bmil(a|en)?\b/.test(et)) return "10K";

  if (/\b5\s*(km|k)\b/.test(et) || et.includes("5km") || et.includes("5 km") || /\b5000\b/.test(et))
    return "5K";

  return null;
}

// Import-run: bruker raceName fra CSV ("Race"-kolonnen)
export function classifyFromRaceName(raceName: string): DistanceCategory {
  const t = (raceName ?? "").toLowerCase();

  if (t.includes("halv") || t.includes("half")) return "HM";
  if (t.includes("maraton") || t.includes("marathon")) return "M";

  if (/\b10\s*(km|k)\b/.test(t) || t.includes("10km") || t.includes("10 km")) return "10K";
  if (/\bmil(a|en)?\b/.test(t)) return "10K";

  if (/\b5\s*(km|k)\b/.test(t) || t.includes("5km") || t.includes("5 km") || /\b5000\b/.test(t))
    return "5K";

  return "OTHER";
}

// valgfri sanity (samme som du hadde)
export function applySanity(cat: DistanceCategory, timeMs: number, raceName: string): DistanceCategory {
  const rn = raceName.toLowerCase();
  if (rn.includes("halv") || rn.includes("half")) return "HM";

  const ONE_H_50 = 1 * 3600_000 + 50 * 60_000;
  if (cat === "M" && timeMs > 0 && timeMs < ONE_H_50) return "HM";

  return cat;
}