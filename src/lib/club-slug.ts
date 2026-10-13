/** URL slug for a club name; must match the SQL expression in lib/clubs.ts. */
export function clubSlug(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9æøåäöü]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
