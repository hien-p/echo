"use client";

import { useEffect } from "react";

/**
 * Service worker registration — currently DISABLED.
 *
 * The first SW build correlated with a client-side exception on
 * /dashboard after deploy, so the live /sw.js is now a kill-switch
 * that self-unregisters and clears caches. This component still
 * runs on every page load to actively unregister any leftover
 * registrations from earlier builds so users don't stay stuck on
 * a broken cached worker.
 *
 * Will be re-enabled with a more conservative caching policy once
 * the original crash is understood.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    void (async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) {
          try {
            await r.unregister();
          } catch {
            /* best-effort */
          }
        }
        // Also nuke any caches a prior SW had populated.
        if (typeof caches !== "undefined") {
          const names = await caches.keys();
          await Promise.all(names.map((n) => caches.delete(n)));
        }
      } catch {
        /* registration teardown is best-effort */
      }
    })();
  }, []);

  return null;
}

export default ServiceWorkerRegister;
