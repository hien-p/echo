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

// Walrus aggregators occasionally 503 on JS/CSS chunks → users see
// "ChunkLoadError" / "Application error". For the Walrus build we point
// every static asset URL at the Cloudflare Pages origin (single-digit-ms
// p99, no aggregator 503s). The HTML still lives on Walrus.
const WALRUS_ASSET_PREFIX = "https://staging.echo-20u.pages.dev";

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
        // Rewrite every <script src="/_next/static/…">, stylesheet, font,
        // and image fetch to the Cloudflare Pages CDN. HTML still ships
        // from Walrus, but chunks come from CF — bypasses aggregator 503s.
        assetPrefix: WALRUS_ASSET_PREFIX,
        // Inline above-the-fold CSS via critters so first paint is correct
        // even if the deferred stylesheet fetch 503s. Critical-CSS work is
        // a no-op for the CF Pages build (same-origin asset fetches), so
        // we only enable it for the Walrus target. Next 15.5 still wires
        // optimizeCss to the legacy `critters` (not the `beasties` fork).
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
