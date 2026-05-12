"use client";

import { useSyncExternalStore } from "react";

/**
 * Tracks `prefers-reduced-motion: reduce` reactively.
 *
 * Hydration-safe via useSyncExternalStore — the server returns the
 * fallback (`false`), and the client immediately reads the actual
 * media query on first render. Components that gate motion entries
 * on this hook produce identical SSR HTML and don't hydrate-mismatch.
 *
 * Use to short-circuit expensive entry animations on /, /forms/[id],
 * and any other surface that defaults to a motion-heavy reveal —
 * judges/respondents with vestibular sensitivity get an instant
 * static layout instead of unblockable 1.6s transforms.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

function subscribe(notify: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  mql.addEventListener("change", notify);
  return () => mql.removeEventListener("change", notify);
}
