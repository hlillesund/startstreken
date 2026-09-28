"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronRight, Clock, Search, X } from "lucide-react";
import type { AthleteHit } from "@/components/utovere/types";
import { initials, scoreHit } from "@/components/utovere/utils";
import { getRecentAthletes } from "@/lib/recent-athletes";

type Props = {
  onSelect: (hit: AthleteHit) => void;
  /** Called on Enter when no suggestion is highlighted. */
  onSubmit?: (query: string) => void;
  placeholder?: string;
  size?: "md" | "lg";
  autoFocus?: boolean;
  exclude?: string[];
  initialQuery?: string;
  /** Show recently viewed athletes when the field is empty. */
  showRecent?: boolean;
  /** Clear the field after a selection. */
  clearOnSelect?: boolean;
  limit?: number;
  /** Render results as an in-flow list instead of a dropdown. */
  inline?: boolean;
};

function hitMeta(h: AthleteHit) {
  const parts: string[] = [];
  if (h.gender === "M") parts.push("Herre");
  if (h.gender === "F") parts.push("Dame");
  if (h.birth_year) parts.push(`f. ${h.birth_year}`);
  return parts.join(" · ") || "Utøver";
}

export default function AthleteSearch({
  onSelect,
  onSubmit,
  placeholder = "Søk etter utøver…",
  size = "md",
  autoFocus,
  exclude = [],
  initialQuery = "",
  showRecent = true,
  clearOnSelect = false,
  limit = 8,
  inline = false,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [q, setQ] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<AthleteHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<AthleteHit[]>([]);

  const excludeKey = exclude.join(",");
  const term = q.trim();
  const searching = term.length >= 2;

  useEffect(() => {
    if (!searching) {
      setHits([]);
      setLoading(false);
      return;
    }
    const excluded = new Set(excludeKey ? excludeKey.split(",") : []);
    const controller = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/athletes/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        const data = await res.json();
        const arr: AthleteHit[] = Array.isArray(data) ? data : [];
        const scored = arr
          .filter((h) => !excluded.has(h.id))
          .map((h, i) => ({ h, s: scoreHit(term, h.display_name), i }))
          // keep DB similarity order as tiebreaker; fuzzy hits (score 0) go last
          .sort((a, b) => b.s - a.s || a.i - b.i);
        setHits(scored.slice(0, limit).map((x) => x.h));
        setActive(-1);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setHits([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [term, searching, excludeKey, limit]);

  useEffect(() => {
    if (inline) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [inline]);

  const excluded = new Set(exclude);
  const recentShown = showRecent && !searching ? recent.filter((r) => !excluded.has(r.id)).slice(0, 5) : [];
  const items = searching ? hits : recentShown;
  const panelVisible = (inline ? searching : open) && (searching || recentShown.length > 0);

  function choose(h: AthleteHit) {
    onSelect(h);
    setOpen(false);
    setActive(-1);
    if (clearOnSelect) setQ("");
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(-1, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && items[active]) choose(items[active]);
      else if (onSubmit && term) {
        setOpen(false);
        onSubmit(term);
      } else if (items[0] && searching) choose(items[0]);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  return (
    <div ref={rootRef} className={`ss-search${size === "lg" ? " ss-search--lg" : ""}`}>
      <div className="ss-search-field">
        <Search size={20} strokeWidth={2.2} aria-hidden="true" />
        <input
          ref={inputRef}
          className="ss-search-input"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={q}
          role="combobox"
          aria-expanded={panelVisible}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setRecent(getRecentAthletes());
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        {loading && <span className="ss-search-spin" aria-hidden="true" />}
        {!loading && q && (
          <button
            type="button"
            className="ss-search-clear"
            aria-label="Tøm søk"
            onClick={() => {
              setQ("");
              setHits([]);
              inputRef.current?.focus();
            }}
          >
            <X size={18} />
          </button>
        )}
      </div>

      {panelVisible && (
        <div className={`ss-search-panel${inline ? " ss-search-panel--inline" : ""}`} id={listId} role="listbox">
          {!searching && <div className="ss-search-label">Nylig sett</div>}
          {searching && !loading && hits.length === 0 && (
            <div className="ss-search-status">Ingen utøvere funnet for «{term}».</div>
          )}
          {searching && loading && hits.length === 0 && <div className="ss-search-status">Søker…</div>}
          {items.map((h, i) => (
            <button
              key={h.id}
              id={`${listId}-${i}`}
              type="button"
              role="option"
              aria-selected={i === active}
              className={`ss-search-item${i === active ? " active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(h)}
            >
              <span className="ss-avatar ss-avatar--sm">
                {searching ? initials(h.display_name) : <Clock size={15} />}
              </span>
              <span className="ss-search-item-body">
                <span className="ss-search-item-name" style={{ display: "block" }}>{h.display_name}</span>
                <span className="ss-search-item-meta" style={{ display: "block" }}>{hitMeta(h)}</span>
              </span>
              <ChevronRight className="ss-search-item-go" size={18} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
