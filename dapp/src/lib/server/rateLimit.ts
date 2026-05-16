/**
 * Minimal in-memory rate limiter + body-size guard for API routes.
 *
 * Scope: best-effort abuse throttling for a single Worker/isolate — each
 * Cloudflare PoP/isolate keeps its own bucket map, which is enough to stop
 * one misbehaving client from flooding an endpoint. It is NOT a substitute
 * for a real distributed limiter (a true DDoS needs a CF/WAF rule).
 *
 * Mirrors the inline limiter in `api/error-log/route.ts`, lifted here so
 * other routes (e.g. the demo-admin endpoint) can share one implementation.
 */

import { NextResponse } from "next/server";

interface Bucket {
  count: number;
  resetAt: number;
}

// keyspace = `${key}:${clientIp}` → bucket. Module-scoped so it persists
// across requests within the same isolate.
const buckets = new Map<string, Bucket>();

/**
 * Derive a stable client identifier. `cf-connecting-ip` is injected by
 * Cloudflare on every request that reaches the Worker; `x-forwarded-for`
 * is the dev/proxy fallback. Unknown clients collapse to one shared
 * bucket ("unknown") — intentionally conservative.
 */
function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export interface RateLimitArgs {
  /** Logical bucket name, e.g. "demo-admin". Isolates limits per endpoint. */
  key: string;
  /** Max allowed requests per `windowMs` per client. */
  limit: number;
  /** The incoming request (used to derive the client IP). */
  request: Request;
  /** Sliding fixed-window length in milliseconds. */
  windowMs: number;
}

/**
 * Returns a 429 `NextResponse` when the caller has exceeded `limit`
 * within `windowMs`, otherwise `null` (request allowed). Callers use:
 *
 *   const limited = rateLimit({ key, limit, request, windowMs });
 *   if (limited) return limited;
 */
export function rateLimit(args: RateLimitArgs): NextResponse | null {
  const id = `${args.key}:${clientIp(args.request)}`;
  const now = Date.now();
  const bucket = buckets.get(id);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(id, { count: 1, resetAt: now + args.windowMs });
    return null;
  }
  if (bucket.count >= args.limit) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return NextResponse.json(
      { error: "Too many requests. Slow down." },
      { status: 429, headers: { "retry-after": String(retryAfter) } },
    );
  }
  bucket.count += 1;
  return null;
}

/**
 * True when the request's declared `content-length` exceeds `maxBytes`.
 * A cheap pre-parse guard so oversized bodies are rejected before any
 * JSON / blob work. A missing/invalid header is treated as within limit
 * (the route's own parsing still bounds what it reads).
 */
export function contentLengthExceeds(
  request: Request,
  maxBytes: number,
): boolean {
  const raw = request.headers.get("content-length");
  if (!raw) return false;
  const len = Number(raw);
  return Number.isFinite(len) && len > maxBytes;
}
