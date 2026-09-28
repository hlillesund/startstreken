import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./ui.css";
import TopNav from "../components/TopNav";
import ViewportFix from "../components/ViewportFix";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nb">
      <body className={`${inter.variable} antialiased`}>
        {/* 🔑 iOS Safari viewport fix */}
        <ViewportFix />

        <TopNav />
        <main>{children}</main>
      </body>
    </html>
  );
}
