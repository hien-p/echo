"use client";

import { useEffect, useState } from "react";

/**
 * Returns the actual form id we should query.
 *
 * On the Cloudflare Pages deploy the param from `[id]` is the real id —
 * just hand it back. On the Walrus Sites static-export deploy there's
 * only one prerendered page at `/forms/_/`, served as a fallback for
 * every `/forms/<id>/` URL via ws-resources.yaml. The route param prop
 * then says `"_"`, but `window.location.pathname` carries the actual id.
 *
 * We always re-derive from pathname client-side so a single resolver
 * works in both deploys without an extra prop / env flag.
 *
 * Returns `null` until the first effect runs so SSR/HTML output never
 * leaks the placeholder "_" — the wrapper shows a loading state instead.
 */
export function useResolvedFormId(propId: string): string | null {
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pathId = pickIdFromPath(window.location.pathname);
    // Prefer the path id when (a) propId is the SPA stub or (b) propId
    // doesn't look like a real Sui object id. Otherwise trust the prop.
    if (pathId && (propId === "_" || !propId.startsWith("0x"))) {
      setResolved(pathId);
    } else {
      setResolved(propId);
    }
  }, [propId]);

  return resolved;
}

function pickIdFromPath(pathname: string): string | null {
  // Match /forms/<id>(/admin)?(/) ; we only care about the <id> capture.
  const m = pathname.match(/^\/forms\/([^/]+)(?:\/admin)?\/?$/);
  if (!m) return null;
  const id = m[1];
  if (id === "_" || !id) return null;
  return id;
}
