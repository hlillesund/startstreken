"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GitCompareArrows, Home, LogOut, Search, Trophy, User } from "lucide-react";
import Logo from "@/components/ui/Logo";

type MeUser =
  | null
  | {
      id: string;
      stravaAthleteId: string;
      displayName: string | null;
      avatarUrl: string | null;
    };

const LINKS = [
  { href: "/utovere", label: "Utøvere", match: (p: string) => p === "/utovere" },
  { href: "/utovere/topp100", label: "Topplister", match: (p: string) => p.startsWith("/utovere/topp100") || p.startsWith("/utovere/ranking") },
  { href: "/utovere/sammenlign", label: "Sammenlign", match: (p: string) => p.startsWith("/utovere/sammenlign") },
  { href: "/lop", label: "Løp", match: (p: string) => p.startsWith("/lop") },
];

const TABS = [
  { href: "/", label: "Hjem", icon: Home, match: (p: string) => p === "/" },
  { href: "/utovere", label: "Søk", icon: Search, match: (p: string) => p === "/utovere" },
  { href: "/utovere/topp100", label: "Topplister", icon: Trophy, match: (p: string) => p.startsWith("/utovere/topp100") || p.startsWith("/utovere/ranking") },
  { href: "/utovere/sammenlign", label: "Sammenlign", icon: GitCompareArrows, match: (p: string) => p.startsWith("/utovere/sammenlign") },
];

export default function TopNav() {
  const pathname = usePathname() ?? "/";
  const [me, setMe] = useState<MeUser>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setMe(data?.user ?? null);
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProfileOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setMe(null);
    setProfileOpen(false);
  }

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

            <div className="ss-profile" ref={profileRef}>
              <button
                className="ss-profile-btn"
                onClick={() => setProfileOpen((v) => !v)}
                aria-label="Profil"
                aria-expanded={profileOpen}
              >
                {me?.avatarUrl ? (
                  <img src={me.avatarUrl} alt={me.displayName ?? "Profil"} referrerPolicy="no-referrer" />
                ) : (
                  <User size={18} />
                )}
              </button>

              {profileOpen && (
                <div className="ss-menu">
                  {me ? (
                    <>
                      <div className="ss-menu-head">
                        <div className="ss-menu-name">{me.displayName ?? "Innlogget"}</div>
                        <div className="ss-menu-meta">Innlogget med Strava</div>
                      </div>
                      <button className="ss-menu-item" onClick={logout}>
                        <LogOut size={16} /> Logg ut
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="ss-menu-head">
                        <div className="ss-menu-name">Ikke logget inn</div>
                        <div className="ss-menu-meta">Logg inn for å kjøpe og selge startnummer</div>
                      </div>
                      <a className="ss-menu-item ss-menu-item--strava" href="/api/auth/strava/start">
                        Logg inn med Strava
                      </a>
                    </>
                  )}
                </div>
              )}
            </div>
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
