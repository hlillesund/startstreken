"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function TopNav() {
  const [open, setOpen] = useState(false);

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

  return (
    <header id="topnav" className="topnav">
      <div className="topnav-bar">
        <div className="topnav-container">

          {/* LOGO – viewport anchored */}
          <Link href="/" className="topnav-logo">
            <img src="/startstreken2.png" alt="Startstreken" />
          </Link>

          {/* DESKTOP NAV */}
          <nav className="topnav-links desktop-nav">

           
          </nav>

          {/* MOBILE BUTTON */}
          <button
            className={`mobile-menu-button ${open ? "open" : ""}`}
            onClick={() => setOpen(v => !v)}
            aria-label="Åpne meny"
          >
            <span />
            <span />
            <span />
          </button>

        </div>
      </div>

      {/* MOBILE MENU */}
   
        <div className={`mobile-menu ${open ? "open" : ""}`}>
         
          <Link href="/utovere" onClick={() => setOpen(false)}>Utøversøk</Link>
        
        </div>
 
    </header>
  );
}