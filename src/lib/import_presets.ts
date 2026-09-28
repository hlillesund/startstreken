import { prisma } from "@/lib/prisma";

export async function getImportPreset(args: {
  sourceSlug: string;
  sourceEventId: string;
  sourceRaceId?: string | null;
}) {
  const source = await prisma.sources.findUnique({
    where: { slug: args.sourceSlug },
  });
  if (!source) return null;

  const raceKey = (args.sourceRaceId ?? "").trim();

  // 1) race-spesifikk først
  if (raceKey.length > 0) {
    const specific = await prisma.import_presets.findUnique({
      where: {
        source_id_source_event_id_source_race_id: {
          source_id: source.id,
          source_event_id: args.sourceEventId,
          source_race_id: raceKey, // string
        },
      },
    });
    if (specific) return specific;
  }

  // 2) event-only fallback (NULL)
  return prisma.import_presets.findFirst({
    where: {
      source_id: source.id,
      source_event_id: args.sourceEventId,
      source_race_id: null,
    },
  });
}