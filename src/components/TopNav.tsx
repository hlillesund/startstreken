"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type MeUser =
  | null
  | {
      id: string;
      stravaAthleteId: string;
      displayName: string | null;
      avatarUrl: string | null;
    };

export default function TopNav() {
  const [open, setOpen] = useState(false);

  // profile state
  const [me, setMe] = useState<MeUser>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const nav = document.getElementById("topnav");
    if (!nav) return;

    const onScroll = () => {
      nav.classList.toggle("scrolled", window.scrollY > 8);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // fetch current user
  useEffect(() => {
    let cancelled = false;

    async function loadMe() {
      try {
        setMeLoading(true);
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) {
          if (!cancelled) setMe(null);
          return;
        }
        const data = await res.json();
        if (!cancelled) setMe(data.user ?? null);
      } catch {
        if (!cancelled) setMe(null);
      } finally {
        if (!cancelled) setMeLoading(false);
      }
    }

    loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  // close dropdown on outside click / esc
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!profileRef.current) return;
      if (!profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProfileOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setMe(null);
    setProfileOpen(false);
  }

  return (
    <header id="topnav" className="topnav">
      <div className="topnav-bar">
        <div className="topnav-container">
          {/* LOGO – viewport anchored */}
          <Link href="/" className="topnav-logo">
            <img src="/startstreken2.png" alt="Startstreken" />
          </Link>

          {/* DESKTOP NAV */}
          <nav className="topnav-links desktop-nav"></nav>

          {/* RIGHT SIDE: profile + mobile */}
          <div className="topnav-right">
            {/* Profile */}
            <div className="topnav-profile" ref={profileRef}>
              <button
                className="topnav-profile-btn"
                onClick={() => setProfileOpen((v) => !v)}
                aria-label="Profil"
              >
                {meLoading ? (
                  <div className="topnav-avatar skeleton" />
                ) : me?.avatarUrl ? (
                  <img
                    className="topnav-avatar"
                    src={me.avatarUrl}
                    alt={me.displayName ?? "Profil"}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="topnav-avatar fallback">👤</div>
                )}
              </button>

              {profileOpen && (
                <div className="topnav-profile-menu">
                  {me ? (
                    <>
                      <div className="topnav-profile-head">
                        <div className="name">{me.displayName ?? "Innlogget"}</div>
                        <div className="meta">Strava</div>
                      </div>

                      <button className="menu-item" onClick={logout}>
                        Logg ut
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="topnav-profile-head">
                        <div className="name">Ikke logget inn</div>
                        <div className="meta">Logg inn for å kjøpe/selge</div>
                      </div>

                      <a className="menu-item" href="/api/auth/strava/start">
                        Logg inn med Strava
                      </a>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* MOBILE BUTTON */}
            <button
              className={`mobile-menu-button ${open ? "open" : ""}`}
              onClick={() => setOpen((v) => !v)}
              aria-label="Åpne meny"
            >
         
              <span />
              <span />
            </button>
          </div>
        </div>
      </div>

      {/* MOBILE MENU */}
      <div className={`mobile-menu ${open ? "open" : ""}`}>
        <Link href="/utovere" onClick={() => setOpen(false)}>
          Utøversøk
        </Link>
      </div>
    </header>
  );
}