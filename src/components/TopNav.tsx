"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import Logo from "@/components/ui/Logo";

const LINKS = [
  { href: "/", label: "Hjem", hint: "Forsiden", match: (p: string) => p === "/" },
  { href: "/utovere", label: "Utøvere", hint: "Søk og profiler", match: (p: string) => p === "/utovere" },
  { href: "/lop", label: "Løp", hint: "Alle løp og resultater", match: (p: string) => p.startsWith("/lop") },
  { href: "/utovere/topp100", label: "Topplister", hint: "Topp 100", match: (p: string) => p.startsWith("/utovere/topp100") || p.startsWith("/utovere/ranking") },
  { href: "/utovere/sammenlign", label: "Sammenlign", hint: "Opptil fire løpere", match: (p: string) => p.startsWith("/utovere/sammenlign") },
  { href: "/klubber", label: "Klubber", hint: "Klubbene og deres løpere", match: (p: string) => p.startsWith("/klubber") },
  { href: "/hvor-havner-jeg", label: "Hvor havner jeg?", hint: "Plasser tiden din", match: (p: string) => p.startsWith("/hvor-havner-jeg") },
];

const nf = new Intl.NumberFormat("nb-NO");

/** Four-point spark, as on the call-to-action */
function Spark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 0c.5 4.2 3.8 7.5 8 8-4.2.5-7.5 3.8-8 8-.5-4.2-3.8-7.5-8-8 4.2-.5 7.5-3.8 8-8z" fill="currentColor" />
    </svg>
  );
}

export default function TopNav() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // status line in the pill, e.g. "39 løp i 2026"
  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => d?.ok && setStatus(`${nf.format(d.events_year)} løp i ${d.year}`))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className="ss-nav">
      <div className="ss-nav-inner" ref={wrapRef}>
        <Logo />

        <button
          type="button"
          className="ss-menu-pill"
          aria-expanded={open}
          aria-controls="ss-menu-panel"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="ss-menu-pill-label">
            <span className="ss-menu-dots" aria-hidden="true"><i /><i /><i /><i /></span>
            Meny
          </span>
          <span className="ss-menu-pill-status">{status ?? "Norges løpsdatabase"}</span>
        </button>

        <div className="ss-nav-right">
          <Link href="/lop" className="ss-nav-cta" onClick={() => setOpen(false)}>
            <Spark />
            Søk løp
          </Link>
        </div>

        {open && (
          <nav id="ss-menu-panel" className="ss-menu-panel" aria-label="Hovedmeny">
            <ul className="ss-menu-links">
              {LINKS.map((l) => {
                const active = l.match(pathname);
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className={`ss-menu-link${active ? " active" : ""}`}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setOpen(false)}
                    >
                      <span>
                        {l.label} <small>{l.hint}</small>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="ss-menu-foot">
              <span>Startstreken · Norges løpsdatabase</span>
              <Link href="/utovere/topp100?category=HM" onClick={() => setOpen(false)}>
                Topp 100 halv <ArrowUpRight size={14} style={{ verticalAlign: -2 }} />
              </Link>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
