/*
 * Echo service worker — kill-switch build.
 *
 * The earlier stale-while-revalidate worker was correlated with a
 * "client-side exception" on /dashboard after deploy. This build:
 *   1. Claims all clients immediately.
 *   2. Deletes every cache it can reach.
 *   3. Unregisters itself so the next page load goes straight to the
 *      network (Walrus aggregator with no SW in the way).
 *
 * Effect: any browser that already has the older SW installed will
 * upgrade to this one on next nav and self-uninstall. New visitors
 * fetch this file once and immediately drop it.
 *
 * Will be replaced with a more conservative caching SW in a follow-up.
 */

self.addEventListener("install", (event) => {
  // Activate immediately, no waiting for a future nav.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Purge every cache this origin has ever stored.
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
      // Take control of open clients so the unregister below applies.
      await self.clients.claim();
      // Unregister so subsequent loads see no SW at all.
      await self.registration.unregister();
      // Force-refresh every controlled client so they bypass the
      // stale chunks the previous worker might have cached.
      const clients = await self.clients.matchAll({ type: "window" });
      for (const c of clients) {
        try {
          c.navigate(c.url);
        } catch {
          /* ignore — best-effort */
        }
      }
    })(),
  );
});

// Don't intercept any requests; let everything go to the network
// directly while we're in kill-switch mode.
self.addEventListener("fetch", () => {});
