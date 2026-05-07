"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Sparkles } from "lucide-react";
import { clientConfig } from "@/config/clientConfig";
import { cn } from "@/lib/utils";

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

  if (!enabled) return null;
  if (!mounted) {
    return (
      <span className="text-xs px-2 py-1 rounded-full border opacity-0">
        Demo admin
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => writeStored(!on)}
      title={
        on
          ? "Demo admin mode ON — server decrypts forms owned by the demo address."
          : "Demo admin mode OFF — wallet-driven decrypt only."
      }
      className={cn(
        "text-xs px-2 py-1 rounded-full border inline-flex items-center gap-1 transition-colors",
        on
          ? "bg-amber-100 border-amber-300 text-amber-900 hover:bg-amber-200"
          : "border-border text-muted-foreground hover:bg-accent",
      )}
    >
      <Sparkles size={12} />
      Demo admin {on ? "on" : "off"}
    </button>
  );
};
