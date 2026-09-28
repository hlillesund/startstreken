// Per-browser list of recently viewed athletes (localStorage, best effort).
import { useSyncExternalStore } from "react";
import type { AthleteHit } from "@/components/utovere/types";

const KEY = "ss:recent-athletes";
const EVENT = "ss:recent-athletes";
const MAX = 8;
const EMPTY: AthleteHit[] = [];

function parse(raw: string | null): AthleteHit[] {
  try {
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((a) => a && typeof a.id === "string" && typeof a.display_name === "string") : [];
  } catch {
    return [];
  }
}

function readRaw() {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function getRecentAthletes(): AthleteHit[] {
  return parse(readRaw());
}

export function addRecentAthlete(hit: AthleteHit) {
  try {
    const next = [
      { id: hit.id, display_name: hit.display_name, birth_year: hit.birth_year ?? null, gender: hit.gender ?? null },
      ...getRecentAthletes().filter((a) => a.id !== hit.id),
    ].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // storage unavailable – ignore
  }
}

// Snapshot cache so useSyncExternalStore gets a stable reference
let lastRaw: string | null | undefined;
let lastVal: AthleteHit[] = EMPTY;

function snapshot() {
  const raw = readRaw();
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastVal = parse(raw);
  }
  return lastVal;
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

export function useRecentAthletes(): AthleteHit[] {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}
