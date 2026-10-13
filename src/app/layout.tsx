import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import "./ui.css";
import TopNav from "../components/TopNav";
import ViewportFix from "../components/ViewportFix";
import RevealObserver, { REVEAL_BOOT_SCRIPT } from "../components/ui/RevealObserver";

// Switzer (Indian Type Foundry, free licence via Fontshare), self-hosted
const switzer = localFont({
  src: [
    { path: "./fonts/switzer-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/switzer-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/switzer-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-switzer",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://startstreken.run"),
  other: {
    "google-adsense-account": "ca-pub-7553946899442750",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#050505",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nb" suppressHydrationWarning>
      <head>
        {/* hide scroll-revealed content before first paint (removed again if JS never runs) */}
        <script dangerouslySetInnerHTML={{ __html: REVEAL_BOOT_SCRIPT }} />
      </head>
      <body className={`${switzer.variable} antialiased`}>
        {/* 🔑 iOS Safari viewport fix */}
        <ViewportFix />

        <RevealObserver />
        <TopNav />
        <main>{children}</main>
        <Analytics />
      </body>
    </html>
  );
}
