"use client";

export default function StartnummerCTA() {
  return (
    <section className="bg-[#728c69]">
      <div className="mx-auto max-w-6xl px-5 py-12 text-center">
        {/* Heading */}
        <h2 className="text-2xl font-semibold text-white">
          Startnummer du ikke får brukt?
        </h2>

        {/* Subtext */}
        <p className="mt-3 text-sm text-white/80 max-w-md mx-auto">
          Gi noen andre muligheten til å oppnå målene sine.
        </p>

        {/* CTA */}
        <div className="mt-6">
          <a
            href="/startnummer" // juster rute ved behov
            className="
              inline-flex items-center justify-center
              rounded-full
              border border-white/70
              px-6 py-3
              text-sm font-medium text-white
              transition
              hover:bg-white hover:text-[#728c69]
              active:scale-[0.98]
            "
          >
            Kjøp og selg startnummer
          </a>
        </div>
      </div>
    </section>
  );
}