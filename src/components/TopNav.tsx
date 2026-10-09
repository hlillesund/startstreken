"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flag, GitCompareArrows, Home, Search, Trophy } from "lucide-react";
import Logo from "@/components/ui/Logo";

const isLop = (p: string) => p.startsWith("/lop");

const LINKS = [
  { href: "/utovere", label: "Utøvere", match: (p: string) => p === "/utovere" },
  { href: "/utovere/topp100", label: "Topplister", match: (p: string) => p.startsWith("/utovere/topp100") || p.startsWith("/utovere/ranking") },
  { href: "/utovere/sammenlign", label: "Sammenlign", match: (p: string) => p.startsWith("/utovere/sammenlign") },
];

const TABS = [
  { href: "/", label: "Hjem", icon: Home, match: (p: string) => p === "/" },
  { href: "/utovere", label: "Utøvere", icon: Search, match: (p: string) => p === "/utovere" },
  { href: "/lop", label: "Løp", icon: Flag, match: isLop },
  { href: "/utovere/topp100", label: "Topplister", icon: Trophy, match: (p: string) => p.startsWith("/utovere/topp100") || p.startsWith("/utovere/ranking") },
  { href: "/utovere/sammenlign", label: "Sammenlign", icon: GitCompareArrows, match: (p: string) => p.startsWith("/utovere/sammenlign") },
];

export default function TopNav() {
  const pathname = usePathname() ?? "/";

  return (
    <>
      <header className="ss-nav">
        <div className="ss-container ss-nav-inner">
          <Logo />

          <nav className="ss-nav-links" aria-label="Hovedmeny">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={`ss-nav-link${l.match(pathname) ? " active" : ""}`}>
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="ss-nav-right">
            {pathname !== "/" && pathname !== "/utovere" && (
              <Link href="/utovere" className="ss-nav-search">
                <Search size={16} />
                Søk etter utøver
              </Link>
            )}
            <Link
              href="/lop"
              className={`ss-btn ss-btn--sm ss-nav-cta${isLop(pathname) ? " active" : ""}`}
              aria-current={isLop(pathname) ? "page" : undefined}
            >
              <Flag size={15} /> Søk løp
            </Link>
          </div>
        </div>
      </header>

      <nav className="ss-tabbar" aria-label="Navigasjon">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = t.match(pathname);
          return (
            <Link key={t.href} href={t.href} className={`ss-tab${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
              <span className="ss-tab-icon">
                <Icon size={20} strokeWidth={active ? 2.4 : 2} />
              </span>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
