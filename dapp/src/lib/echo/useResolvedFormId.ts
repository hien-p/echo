"use client";

import { useEffect, useState } from "react";

const FULL_SUI_ID = /^0x[0-9a-fA-F]{64}$/;

/**
 * Returns the actual form id we should query, or one of:
 *   - `null`  → resolver hasn't run yet (loading)
 *   - `""`    → the URL is the static SPA-fallback (`/forms/_/`) with
 *               no real id present; consumer should redirect to /forms
 *               instead of querying chain with a bogus id.
 *
 * On the Cloudflare Pages deploy the param from `[id]` is the real id.
 * On the Walrus Sites static-export deploy there's only one prerendered
 * page at `/forms/_/`, served as a fallback for every `/forms/<id>/`
 * URL via ws-resources.json. `window.location.pathname` carries the
 * real id, EXCEPT when the user literally typed `/forms/_/` — in that
 * case we have nothing to query and must avoid sending `_` to Sui.
 */
export function useResolvedFormId(propId: string): string | null | "" {
  const [resolved, setResolved] = useState<string | null | "">(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pathId = pickIdFromPath(window.location.pathname);

    // 1. Real Sui object id in propId — trust the route param.
    if (FULL_SUI_ID.test(propId)) {
      setResolved(propId);
      return;
    }
    // 2. SPA fallback path with a real id baked in pathname.
    if (pathId && FULL_SUI_ID.test(pathId)) {
      setResolved(pathId);
      return;
    }
    // 3. Literal `/forms/_/` URL — nothing to resolve.
    setResolved("");
  }, [propId]);

  return resolved;
}

function pickIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/forms\/([^/]+)(?:\/admin)?\/?$/);
  if (!m) return null;
  const id = m[1];
  if (id === "_" || !id) return null;
  return id;
}
