"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

/** Filters the result list by name, club or bib (updates ?q= after a short pause). */
export default function ResultSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function apply(v: string) {
    const p = new URLSearchParams(params.toString());
    if (v.trim()) p.set("q", v.trim());
    else p.delete("q");
    p.delete("p");
    p.delete("utover");
    const s = p.toString();
    router.replace(`${pathname}${s ? `?${s}` : ""}`, { scroll: false });
  }

  function onChange(v: string) {
    setValue(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => apply(v), 300);
  }

  return (
    <div className="ss-search-field ss-search-field--sm">
      <Search size={16} />
      <input
        className="ss-search-input"
        type="search"
        placeholder="Navn, klubb eller startnr."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            clearTimeout(timer.current);
            apply(value);
          }
        }}
        aria-label="Søk i resultatene"
        autoComplete="off"
      />
      {value && (
        <button className="ss-search-clear" onClick={() => onChange("")} aria-label="Tøm søk">
          <X size={16} />
        </button>
      )}
    </div>
  );
}

export function ScrollIntoView({ id }: { id: string }) {
  useEffect(() => {
    document.getElementById(id)?.scrollIntoView({ block: "center" });
  }, [id]);
  return null;
}
