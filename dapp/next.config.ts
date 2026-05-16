import type { NextConfig } from "next";

/**
 * Two build targets:
 *
 *   pnpm build           → standard Next.js build (Cloudflare Pages,
 *                          serves /api/* edge functions + static assets
 *                          from the same origin).
 *
 *   WALRUS_BUILD=1 pnpm build:walrus → static export for Walrus Sites.
 *                          The /api directory is moved aside by the
 *                          wrapper script (Next.js refuses to static-export
 *                          a project containing /api routes). The SPA on
 *                          Walrus then talks to the Cloudflare /api/*
 *                          endpoints via NEXT_PUBLIC_API_BASE_URL.
 */
const isWalrusBuild = process.env.WALRUS_BUILD === "1";

// NOTE: assetPrefix → Cloudflare was tried and reverted. The Walrus
// static export and the CF Pages `next build` are SEPARATE builds with
// DIFFERENT content hashes, so the Walrus HTML ended up referencing
// `staging.echo-20u.pages.dev/_next/static/css/<walrus-hash>.css`
// which 404s on CF (CF only has its own <cf-hash>.css). Result: every
// page rendered unstyled — strictly worse than the occasional 503.
// Resilience now relies on the in-<head> chunk-retry shim + error.tsx
// boundary + deploy-time aggregator pre-warm instead. A real
// "assets-on-CDN" fix would require building ONCE and deploying the
// identical artifact to both hosts (CI change, not done here).

const nextConfig: NextConfig = {
  // Walrus Sites needs a fully static, file-extension-aware bundle.
  ...(isWalrusBuild
    ? {
        output: "export" as const,
        // Use a dedicated build cache dir so this never clobbers `.next/`
        // when `pnpm dev` is also running. Static-export artifacts still
        // land in `dapp/out/` (Next's hard-coded export target).
        distDir: ".next-walrus",
        // Walrus Sites serves files; without trailingSlash internal links
        // like "/forms" miss because the host expects "/forms/index.html".
        trailingSlash: true,
        // next/image's default optimizer needs a server. Disable for export.
        images: { unoptimized: true },
        // Inline above-the-fold CSS via critters/beasties so the first
        // paint is correct even if the deferred Walrus stylesheet fetch
        // 503s. Same-origin assets again (no assetPrefix) so a 503 just
        // delays the tail, not the critical paint.
        experimental: {
          optimizeCss: true,
        },
      }
    : {
        async rewrites() {
          return [
            // Serve the static devlog at /logs and /logs/ from public/logs/index.html.
            { source: "/logs", destination: "/logs/index.html" },
            { source: "/logs/", destination: "/logs/index.html" },
          ];
        },
      }),
  webpack: (config, { nextRuntime }) => {
    // @mysten-incubation/memwal has a dynamic `import("crypto")` as a fallback
    // when Web Crypto isn't available. On edge that path is dead (subtle is
    // present), but webpack still tries to resolve the import. Ignore it.
    if (nextRuntime === "edge") {
      config.resolve = config.resolve ?? {};
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
