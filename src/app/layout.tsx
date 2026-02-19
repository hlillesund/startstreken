import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import TopNav from "../components/TopNav";
import ViewportFix from "../components/ViewportFix";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        {/* 🔑 iOS Safari viewport fix */}
        <ViewportFix />

        <TopNav />
        <main>{children}</main>
      </body>
    </html>
  );
}