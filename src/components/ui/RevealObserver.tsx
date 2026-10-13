"use client";

import { useEffect } from "react";

/**
 * Floats `.ss-reveal` elements in as they enter the viewport and out as they
 * leave over the top (so scrolling back up brings them in again). Works with
 * elements added later (client navigation, async content) via a MutationObserver.
 *
 * The `rv` class on <html> (set by an inline script before paint) is what hides
 * elements initially; it's removed again if this never runs, so content can't
 * stay hidden.
 */
export default function RevealObserver() {
  useEffect(() => {
    const root = document.documentElement;
    (window as unknown as { __rvReady?: boolean }).__rvReady = true;
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.classList.remove("rv");
      return;
    }
    root.classList.add("rv");

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const el = e.target as HTMLElement;
          if (e.isIntersecting) {
            el.classList.add("is-in");
            el.classList.remove("is-above");
          } else if (e.boundingClientRect.top < 0) {
            el.classList.add("is-above");
            el.classList.remove("is-in");
          } else {
            el.classList.remove("is-in", "is-above");
          }
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.06 }
    );

    const scan = () => {
      document.querySelectorAll<HTMLElement>(".ss-reveal:not([data-rv])").forEach((el) => {
        el.setAttribute("data-rv", "");
        io.observe(el);
      });
    };
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);

  return null;
}

/** Runs before first paint: opt in to hidden-until-revealed, with a safety net. */
export const REVEAL_BOOT_SCRIPT = `(function(){try{if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;var d=document.documentElement;d.classList.add('rv');setTimeout(function(){if(!window.__rvReady)d.classList.remove('rv')},4000)}catch(e){}})();`;
