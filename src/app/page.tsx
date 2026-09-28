import type { Metadata } from "next";
import HomeClient from "./HomeClient";

export const metadata: Metadata = {
  title: "Startstreken – Norges løpsdatabase for utøvere og resultater",
  description:
    "Søk opp utøvere, se personlige rekorder, ranking, grafer og løpsresultater. Startstreken bygger Norges beste løpsdatabase.",
  alternates: {
    canonical: "https://startstreken.run/",
  },
  openGraph: {
    type: "website",
    url: "https://startstreken.run/",
    title: "Startstreken – Norges løpsdatabase",
    description:
      "Søk opp utøvere, se personlige rekorder, ranking, grafer og løpsresultater.",
    siteName: "Startstreken",
    // images: [{ url: "https://startstreken.run/og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Startstreken – Norges løpsdatabase",
    description:
      "Søk opp utøvere, se personlige rekorder, ranking, grafer og løpsresultater.",
    // images: ["https://startstreken.run/og.png"],
  },
  robots: {
    index: true,
    follow: true,
    // Google kan være litt streng på nye domener; dette er trygt:
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
};

export default function Page() {
  return (
    <>
      {/* Structured data (ikke synlig, endrer ikke UI) */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Startstreken",
            url: "https://startstreken.run/",
            potentialAction: {
              "@type": "SearchAction",
              // Siden søk er client-side, kan du peke til utøversøk (eller senere en faktisk query-url)
              target: "https://startstreken.run/utovere",
              "query-input": "required name=query",
            },
          }),
        }}
      />
      <HomeClient />
    </>
  );
}