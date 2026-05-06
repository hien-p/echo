import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Serve the static devlog at /logs and /logs/ from public/logs/index.html.
      { source: "/logs", destination: "/logs/index.html" },
      { source: "/logs/", destination: "/logs/index.html" },
    ];
  },
};

export default nextConfig;
