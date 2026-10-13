import type { Metadata } from "next";
import { Suspense } from "react";
import PlacementTool from "./PlacementTool";

export const metadata: Metadata = {
  title: "Hvor havner jeg? – Startstreken",
  description: "Skriv inn en tid og se hvor du havner blant norske løpere i år, i aldersklassen din og i årets største løp.",
};

export default function HvorHavnerJegPage() {
  return (
    <div className="ss-page">
      <div className="ss-container">
        <div className="ss-pagehead">
          <div className="ss-eyebrow">Verktøy</div>
          <h1 className="ss-h1" style={{ marginTop: 6 }}>
            Hvor <em>havner jeg?</em>
          </h1>
          <p className="ss-sub">Skriv inn en tid og se hvor den plasserer deg blant norske løpere i år, i aldersklassen din og i årets største løp.</p>
        </div>
        <Suspense>
          <PlacementTool />
        </Suspense>
      </div>
    </div>
  );
}
