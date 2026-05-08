"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Sparkles, HelpCircle, X } from "lucide-react";
import { clientConfig } from "@/config/clientConfig";
import { cn } from "@/lib/utils";

const NUDGE_KEY = "echo:demo-admin-nudge-seen";

const STORAGE_KEY = "echo:demo-admin";
const EVENT_NAME = "echo:demo-admin-change";

function readStored(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStored(on: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* private mode / quota */
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: on }));
}

function subscribe(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", handler);
  };
}

/**
 * Hook returns `true` when the demo-admin pill is on AND demo mode is configured.
 * Hydration-safe — always returns `false` on first render to match SSR.
 */
export function useDemoAdminMode(): boolean {
  const enabled = !!clientConfig.DEMO_ADMIN_ADDRESS;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const stored = useSyncExternalStore(subscribe, readStored, () => false);
  return mounted && enabled && stored;
}

export const DemoAdminToggle = () => {
  const enabled = !!clientConfig.DEMO_ADMIN_ADDRESS;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const on = useSyncExternalStore(subscribe, readStored, () => false);
  // Auto-show the explainer popover the first time a visitor sees the pill.
  // Persisted in localStorage so repeat visits don't nag.
  const [showInfo, setShowInfo] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    try {
      if (window.localStorage.getItem(NUDGE_KEY) !== "1") setShowInfo(true);
    } catch {
      /* private mode */
    }
  }, [enabled]);

  const dismissInfo = () => {
    setShowInfo(false);
    try {
      window.localStorage.setItem(NUDGE_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  if (!enabled) return null;
  if (!mounted) {
    return (
      <span className="inline-flex items-center gap-2 opacity-0">
        <span className="text-xs">Demo admin</span>
        <span className="w-9 h-5 rounded-full" />
      </span>
    );
  }

  return (
    <span className="relative inline-flex items-center gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => writeStored(!on)}
        title={
          on
            ? "Demo admin mode ON — server decrypts forms owned by the demo address."
            : "Demo admin mode OFF — wallet-driven decrypt only."
        }
        className={cn(
          "inline-flex items-center gap-2 text-xs select-none cursor-pointer rounded-full px-2 py-1 transition-colors",
          on ? "text-amber-900 bg-amber-50" : "text-muted-foreground",
        )}
      >
        <Sparkles
          size={12}
          className={cn(
            "transition-transform duration-300",
            on && "rotate-12 text-amber-600",
          )}
        />
        <span className="font-medium">Demo admin</span>
        <span
          className={cn(
            "relative inline-flex shrink-0 h-5 w-9 items-center rounded-full border transition-colors duration-300",
            on ? "bg-amber-400 border-amber-500" : "bg-muted border-border",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-300 ease-out",
              on ? "translate-x-[18px]" : "translate-x-0.5",
            )}
          />
        </span>
      </button>
      <button
        type="button"
        onClick={() => setShowInfo((s) => !s)}
        title="What is demo admin mode?"
        className="text-muted-foreground hover:text-foreground"
        aria-label="What is demo admin mode?"
      >
        <HelpCircle size={14} />
      </button>
      {showInfo && (
        <div className="absolute right-0 top-full mt-2 w-80 z-50 rounded border bg-card shadow-lg p-3 text-xs flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <strong className="text-sm">What is Demo admin mode?</strong>
            <button
              type="button"
              onClick={dismissInfo}
              className="text-muted-foreground hover:text-foreground -mt-0.5"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            A showcase mode for visitors who don&apos;t want to connect a
            wallet. When ON, the server uses a demo key to read forms created by
            the project&apos;s demo address — so you can browse encrypted
            submissions, RAG over them, and try the admin tools without owning
            anything.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            <strong className="text-foreground">
              Real users keep their keys.
            </strong>{" "}
            Forms you create with your own wallet stay wallet-gated regardless
            of this toggle — the server can never decrypt them.
          </p>
          <button
            type="button"
            onClick={dismissInfo}
            className="border rounded px-3 py-1 text-xs w-fit hover:bg-accent self-end"
          >
            Got it
          </button>
        </div>
      )}
    </span>
  );
};
