"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tiny self-contained toast stack — bottom-right, dismiss-on-click,
 * auto-dismiss after 6s. Used for realtime "new submission" notifs
 * on the dashboard. Dispatch via the global `echo:toast` window event
 * so any component (including ones outside React tree) can fire one
 * without prop-drilling a context.
 *
 * Usage:
 *   <Toaster />            // mount once at the page root
 *   pushToast({ kind: "info", title: "...", body: "..." });
 */

export type ToastKind = "info" | "success" | "error";

export interface ToastInput {
  kind: ToastKind;
  title: string;
  body?: string;
  /** Optional click-to-navigate URL */
  href?: string;
  /** Auto-dismiss after ms; default 6000. Pass 0 to keep until clicked. */
  ttlMs?: number;
}

interface Toast extends ToastInput {
  id: number;
}

const EVENT = "echo:toast";

let nextId = 1;

export function pushToast(input: ToastInput) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastInput>(EVENT, { detail: input }));
}

export function Toaster() {
  const [mounted, setMounted] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<ToastInput>).detail;
      const id = nextId++;
      const t: Toast = { ...detail, id };
      setToasts((curr) => [...curr, t]);
      const ttl = detail.ttlMs ?? 6000;
      if (ttl > 0) {
        setTimeout(() => {
          setToasts((curr) => curr.filter((x) => x.id !== id));
        }, ttl);
      }
    };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[360px] flex-col gap-2 sm:bottom-6 sm:right-6"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <ToastCard
          key={t.id}
          toast={t}
          onDismiss={() =>
            setToasts((curr) => curr.filter((x) => x.id !== t.id))
          }
        />
      ))}
    </div>,
    document.body,
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const Icon =
    toast.kind === "success" ? Check : toast.kind === "error" ? X : Bell;
  const tone =
    toast.kind === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-50"
      : toast.kind === "error"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-50"
        : "border-blue-500/30 bg-blue-500/10 text-blue-50";
  const Wrapper = toast.href ? "a" : "div";
  return (
    <Wrapper
      {...(toast.href
        ? { href: toast.href, target: "_self", rel: "noopener" }
        : {})}
      onClick={onDismiss}
      className={cn(
        "pointer-events-auto flex cursor-pointer items-start gap-3 rounded-xl border bg-zinc-900/90 p-3 text-sm shadow-2xl backdrop-blur transition hover:bg-zinc-900",
        tone,
      )}
    >
      <Icon
        size={16}
        className="mt-0.5 shrink-0"
        aria-hidden="true"
        strokeWidth={2.5}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="font-medium text-zinc-50">{toast.title}</div>
        {toast.body && (
          <div className="truncate text-xs text-zinc-300">{toast.body}</div>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        aria-label="Dismiss"
        className="ml-1 shrink-0 text-zinc-400 hover:text-zinc-200"
      >
        <X size={14} />
      </button>
    </Wrapper>
  );
}
