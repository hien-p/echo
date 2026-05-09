import { NextResponse, type NextRequest } from "next/server";

/**
 * CORS for /api/* so the Walrus Sites SPA build (served from a different
 * origin like `<base32>.wal.app` or a SuiNS subdomain) can call the API
 * routes hosted on the Cloudflare Pages origin.
 *
 * For the single-origin Cloudflare deploy these headers are harmless — same
 * origin requests don't enforce them. For cross-origin Walrus → CF Pages
 * we need both the OPTIONS preflight handler and the standard headers on
 * the actual response.
 *
 * Origin policy: open to any origin (`*`) since these endpoints are either
 * (a) public-data lookups (Walrus proxy, OpenAPI swagger, health) or (b)
 * gated by their own auth (Enoki sponsorship checks tx kind, demo decrypt
 * checks owner address). If a future endpoint needs origin-restricted
 * access, swap `*` for an allowlist + Vary: Origin.
 */

const ALLOWED_HEADERS = "content-type, authorization";

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "access-control-allow-origin": origin ?? "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": ALLOWED_HEADERS,
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin");
  // OPTIONS preflight — return 204 with CORS headers, no body.
  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders(origin),
    });
  }
  // Regular request — let it pass through, then attach headers on the way out.
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(corsHeaders(origin))) {
    res.headers.set(k, v);
  }
  return res;
}

export const config = {
  // Only run on /api/* — keep static assets and pages on the fast path.
  matcher: ["/api/:path*"],
};
