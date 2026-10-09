import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import "./globals.css";
import "./ui.css";
import TopNav from "../components/TopNav";
import ViewportFix from "../components/ViewportFix";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Editorial serif for headlines, big numbers and the wordmark
const serif = Instrument_Serif({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
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
  themeColor: "#1d1f2c",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nb">
      <body className={`${inter.variable} ${serif.variable} antialiased`}>
        {/* 🔑 iOS Safari viewport fix */}
        <ViewportFix />

        <TopNav />
        <main>{children}</main>
      </body>
    </html>
  );
}
