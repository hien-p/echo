"use client";

import { useEffect, useState } from "react";

/**
 * Root error boundary.
 *
 * Walrus aggregators serve Next chunks; one cold aggregator returning
 * 503 throws `ChunkLoadError` and Next's default error boundary just
 * prints "Application error". Detect that specific case and auto-reload
 * — the next request hits a different aggregator and almost always
 * succeeds. Capped at MAX_RETRIES so a truly broken build doesn't loop.
 *
 * Other errors get a static "something went wrong" + manual "try again"
 * + "go home" buttons.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const isChunkError =
    error.name === "ChunkLoadError" ||
    /Loading chunk \d+ failed/.test(error.message) ||
    /Failed to fetch dynamically imported module/.test(error.message);

  useEffect(() => {
    if (!isChunkError) return;
    const STORAGE_KEY = "echo:chunk-retry-count";
    const MAX_RETRIES = 3;
    let count = 0;
    try {
      count = parseInt(sessionStorage.getItem(STORAGE_KEY) || "0", 10);
    } catch {
      /* private mode */
    }
    if (count >= MAX_RETRIES) {
      // Give up — leave the UI for the user to manually retry / go home.
      setSecondsLeft(null);
      return;
    }
    try {
      sessionStorage.setItem(STORAGE_KEY, String(count + 1));
    } catch {
      /* ignore */
    }
    // Show a 2 s countdown, then hard-reload so the browser bypasses
    // every in-flight cache and hits the aggregator pool fresh.
    setSecondsLeft(2);
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s === null) return null;
        if (s <= 1) {
          clearInterval(t);
          if (typeof window !== "undefined") {
            window.location.reload();
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [isChunkError]);

  // Reset retry counter on successful navigation away from an error.
  const resetAndClear = () => {
    try {
      sessionStorage.removeItem("echo:chunk-retry-count");
    } catch {
      /* ignore */
    }
    reset();
  };

  return (
    <div
      style={{
        minHeight: "70vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 24,
        textAlign: "center",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        color: "var(--echo-ink, #0A0A0A)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          border: "2px solid rgba(0,0,0,0.08)",
          borderTopColor: isChunkError
            ? "var(--echo-sui-sea, #4DA2FF)"
            : "var(--echo-warn, #B45309)",
          animation: isChunkError ? "ff-spin 0.9s linear infinite" : "none",
        }}
      />
      <h2
        style={{
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: "-0.02em",
          margin: 0,
        }}
      >
        {isChunkError
          ? "Walrus is warming up…"
          : "Something went wrong."}
      </h2>
      <p
        style={{
          fontSize: 14,
          color: "var(--echo-mut, #737373)",
          maxWidth: 480,
          lineHeight: 1.55,
          margin: 0,
        }}
      >
        {isChunkError
          ? `A code chunk timed out from one of the Walrus aggregators. ${
              secondsLeft !== null
                ? `Auto-retrying in ${secondsLeft}s — most requests succeed on the next aggregator.`
                : "Max auto-retries reached. Reload manually or come back in a minute."
            }`
          : `${error.message}${error.digest ? ` · ${error.digest}` : ""}`}
      </p>
      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") window.location.reload();
          }}
          style={{
            padding: "9px 16px",
            border: "2px solid var(--echo-ink, #0A0A0A)",
            borderRadius: 8,
            background: "var(--echo-ink, #0A0A0A)",
            color: "var(--echo-paper, #FFFFFF)",
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
            fontSize: 11,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          reload now
        </button>
        <button
          type="button"
          onClick={resetAndClear}
          style={{
            padding: "9px 16px",
            border: "1px solid var(--echo-rail, #E5E5E5)",
            borderRadius: 8,
            background: "var(--echo-paper, #FFFFFF)",
            color: "var(--echo-ink, #0A0A0A)",
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
            fontSize: 11,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          try again
        </button>
        {/* Plain anchor on purpose — this is a global error boundary,
            React-Router context may be torn down, and a hard nav back
            to / is the goal. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          style={{
            padding: "9px 16px",
            border: "1px solid var(--echo-rail, #E5E5E5)",
            borderRadius: 8,
            background: "var(--echo-paper, #FFFFFF)",
            color: "var(--echo-mut, #737373)",
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
            fontSize: 11,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          home
        </a>
      </div>
    </div>
  );
}
