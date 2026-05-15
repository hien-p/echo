import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Minimal error-telemetry sink.
 *
 * The dapp ships across two origins — Walrus Sites (`echo-forms.wal.app`)
 * for HTML, Cloudflare Pages (`*.echo-20u.pages.dev`) for `/api/*` and
 * chunks. ChunkLoadError is the dominant production failure mode (cold
 * aggregator → 503 on a JS chunk). This endpoint lets the client report
 * those crashes so we can correlate them with build IDs and aggregators.
 *
 * Storage is intentionally just `console.log` for now — CF Pages exposes
 * structured worker logs, which is enough to spot a regression. A real
 * sink (D1/KV) can be added later without changing the client wire format.
 *
 * No PII: payload is intentionally narrow (message, stack, URL, UA, build,
 * retry count, chunk URL, aggregator host). Stack traces are clipped.
 */

// ---------- CORS ----------
const ALLOWED_ORIGINS = new Set<string>([
  "https://echo-forms.wal.app",
  "https://staging.echo-20u.pages.dev",
]);

function corsHeadersFor(origin: string | null): HeadersInit {
  const allowed =
    origin &&
    (ALLOWED_ORIGINS.has(origin) ||
      /^https:\/\/[a-z0-9-]+\.echo-20u\.pages\.dev$/i.test(origin));
  return {
    "Access-Control-Allow-Origin": allowed ? origin! : "https://echo-forms.wal.app",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

// ---------- Rate limit ----------
// Per-IP token bucket: 30 events / 5 min. The Edge runtime keeps module
// scope alive across invocations within the same isolate, so this works
// well enough as a first-pass guard. It is NOT a global limit — each CF
// PoP/isolate has its own bucket. Good enough to stop a single crashing
// tab from flooding logs; a real DDoS would need a CF rule.
const WINDOW_MS = 5 * 60 * 1000;
const MAX_EVENTS = 30;
const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (b.count >= MAX_EVENTS) return false;
  b.count += 1;
  return true;
}

// ---------- Schema ----------
const payloadSchema = z.object({
  event: z.string().min(1).max(64),
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  url: z.string().max(2000).optional(),
  ua: z.string().max(500).optional(),
  build: z.string().max(128).optional(),
  retries: z.number().int().min(0).max(20).optional(),
  chunkUrl: z.string().max(2000).optional(),
  aggregator: z.string().max(256).optional(),
});

export function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeadersFor(request.headers.get("origin")),
  });
}

export async function POST(request: Request) {
  const cors = corsHeadersFor(request.headers.get("origin"));

  // `cf-connecting-ip` is set by Cloudflare on every request that reaches
  // Pages/Workers. The Edge runtime exposes incoming headers via
  // `request.headers`, so this works in production. In `next dev` the
  // header is missing and we fall back to "unknown" — that just means the
  // bucket key is "unknown" for everyone on localhost, which is fine.
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  if (!rateLimit(ip)) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: cors },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400, headers: cors },
    );
  }

  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_payload" },
      { status: 400, headers: cors },
    );
  }

  // Derive aggregator hint from the originating page URL when the client
  // didn't supply one. echo-forms.wal.app vs *.pages.dev tells us which
  // build the user was on.
  let aggregator = parsed.data.aggregator;
  if (!aggregator && parsed.data.url) {
    try {
      aggregator = new URL(parsed.data.url).host;
    } catch {
      /* ignore */
    }
  }

  // Structured single-line log so the CF Pages log viewer stays scannable.
  // `ECHO_ERR ` prefix is the grep handle.
  console.log(
    `ECHO_ERR ${JSON.stringify({
      ts: new Date().toISOString(),
      ip,
      event: parsed.data.event,
      message: parsed.data.message.slice(0, 500),
      stack: parsed.data.stack?.slice(0, 2000),
      url: parsed.data.url,
      ua: parsed.data.ua,
      build: parsed.data.build ?? "unknown",
      retries: parsed.data.retries,
      chunkUrl: parsed.data.chunkUrl,
      aggregator,
    })}`,
  );

  return NextResponse.json({ ok: true }, { headers: cors });
}
