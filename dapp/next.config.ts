import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Serve the static devlog at /logs and /logs/ from public/logs/index.html.
      { source: "/logs", destination: "/logs/index.html" },
      { source: "/logs/", destination: "/logs/index.html" },
    ];
  },
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
