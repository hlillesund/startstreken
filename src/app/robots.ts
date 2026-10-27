import type { MetadataRoute } from "next";

/**
 * Every page here is rendered on the server, so crawler traffic costs function
 * time. Search engines may index the pages, but not the endless variants made by
 * query strings, the API or the admin; AI scrapers and SEO tools are kept out.
 */
const BLOCKED_BOTS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "CCBot",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "Google-Extended",
  "Applebot-Extended",
  "PerplexityBot",
  "Bytespider",
  "Amazonbot",
  "meta-externalagent",
  "FacebookBot",
  "Diffbot",
  "omgili",
  "ImagesiftBot",
  "cohere-ai",
  "AhrefsBot",
  "SemrushBot",
  "MJ12bot",
  "DotBot",
  "DataForSeoBot",
  "BLEXBot",
  "PetalBot",
  "YandexBot",
  "barkrowler",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: BLOCKED_BOTS, disallow: "/" },
      {
        userAgent: "*",
        // athlete profiles stay indexable (they load their data from /api/athletes/)
        allow: ["/", "/utovere?athleteId=", "/api/athletes/"],
        disallow: ["/api/", "/api/athletes/*/refresh-eqtiming", "/admin", "/*?*", "/utovere/sammenlign"],
        crawlDelay: 5,
      },
    ],
    host: "https://www.startstreken.run",
  };
}
