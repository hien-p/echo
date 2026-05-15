"use client";

import { useEffect } from "react";
import { apiUrl } from "@/config/clientConfig";

/**
 * Fire-and-forget client error reporter.
 *
 * Hooks `window.error` + `unhandledrejection` and POSTs a minimal envelope
 * to `/api/error-log` so we can measure ChunkLoadError + other client
 * crashes in production. No SDK, no PII, no persistence — payloads flow
 * straight to the API and are forgotten in the client.
 *
 * Coalesces identical messages within 5 s to avoid log spam when a single
 * crash fires multiple listeners (e.g. a chunk load failing both as a
 * script `error` and a downstream `unhandledrejection`).
 *
 * Best-effort: `keepalive: true` lets the browser flush the request even
 * if the page is unloading. All failures are swallowed — we never want
 * the reporter itself to be the thing that crashes the page.
 */

const CHUNK_RE = /Loading chunk \d+ failed/i;
const COALESCE_MS = 5_000;

// In-memory dedupe map. Bounded by trimming on every insert so a long-
// lived crashing tab can't grow it unboundedly.
const seen = new Map<string, number>();

function shouldSend(key: string): boolean {
  const now = Date.now();
  const last = seen.get(key);
  if (last !== undefined && now - last < COALESCE_MS) return false;
  seen.set(key, now);
  if (seen.size > 50) {
    for (const [k, t] of seen) {
      if (now - t > COALESCE_MS) seen.delete(k);
    }
  }
  return true;
}

function extractChunkUrl(message: string): string | undefined {
  // Webpack's ChunkLoadError serializes as e.g.
  //   "Loading chunk 4823 failed. (error: https://host/_next/static/chunks/4823-abc.js)"
  const m = /https?:\/\/\S+?\.js/i.exec(message);
  return m ? m[0] : undefined;
}

function readRetryCount(): number | undefined {
  try {
    const raw = sessionStorage.getItem("echo:chunk-retry-count");
    if (!raw) return undefined;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

interface Envelope {
  event: string;
  message: string;
  stack?: string;
  url?: string;
  ua?: string;
  build?: string;
  retries?: number;
  chunkUrl?: string;
  aggregator?: string;
}

function send(payload: Envelope): void {
  try {
    void fetch(apiUrl("/api/error-log"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
      // Cross-origin from echo-forms.wal.app → *.pages.dev. CORS-allowed
      // by the route handler.
      mode: "cors",
      credentials: "omit",
    }).catch(() => {
      /* swallow */
    });
  } catch {
    /* swallow */
  }
}

function buildEnvelope(args: {
  event: string;
  rawName?: string;
  message: string;
  stack?: string;
}): Envelope {
  const { event, rawName, message, stack } = args;
  const isChunk =
    rawName === "ChunkLoadError" ||
    event === "ChunkLoadError" ||
    CHUNK_RE.test(message);
  const env: Envelope = {
    event: isChunk ? "ChunkLoadError" : event,
    message: message.slice(0, 1000),
    stack: stack?.slice(0, 4000),
    url: typeof location !== "undefined" ? location.href : undefined,
    ua: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    build: process.env.NEXT_PUBLIC_BUILD_ID || "unknown",
  };
  if (isChunk) {
    env.chunkUrl = extractChunkUrl(message);
    env.retries = readRetryCount();
  }
  if (typeof location !== "undefined") {
    env.aggregator = location.host;
  }
  return env;
}

export function ErrorReporter(): null {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onError = (e: ErrorEvent) => {
      // Resource load errors (script/img/link) reach `window.error` as
      // events whose `error` is null and `message` is empty. Skip those —
      // the inline chunk-retry shim in <head> already handles them.
      const message = e.message || e.error?.message || "";
      if (!message) return;
      const key = `error:${message}`;
      if (!shouldSend(key)) return;
      send(
        buildEnvelope({
          event: "error",
          rawName: e.error?.name,
          message,
          stack: e.error?.stack,
        }),
      );
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason as unknown;
      let message = "";
      let stack: string | undefined;
      let name: string | undefined;
      if (reason instanceof Error) {
        message = reason.message;
        stack = reason.stack;
        name = reason.name;
      } else if (typeof reason === "string") {
        message = reason;
      } else {
        try {
          message = JSON.stringify(reason);
        } catch {
          message = String(reason);
        }
      }
      if (!message) return;
      const key = `unhandledrejection:${message}`;
      if (!shouldSend(key)) return;
      send(
        buildEnvelope({
          event: "unhandledrejection",
          rawName: name,
          message,
          stack,
        }),
      );
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
