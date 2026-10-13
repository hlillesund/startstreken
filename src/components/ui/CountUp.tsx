"use client";

import { useEffect, useRef } from "react";

const nf = new Intl.NumberFormat("nb-NO");

/**
 * Counts from 0 to `value` the first time it scrolls into view.
 * Renders the final value (no-JS, reduced motion); the animation writes the
 * digits straight to the element so React never re-renders per frame.
 */
export default function CountUp({ value, duration = 1300, format = (n: number) => nf.format(n) }: { value: number; duration?: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const fmt = useRef(format);

  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const f = fmt.current;
    el.textContent = f(0);
    let raf = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (t: number) => {
          const k = Math.min(1, (t - start) / duration);
          el.textContent = f(Math.round(value * (1 - Math.pow(1 - k, 3))));
          if (k < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      el.textContent = f(value);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className="ss-num">
      {format(value)}
    </span>
  );
}
