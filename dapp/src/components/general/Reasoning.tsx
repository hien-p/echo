"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Brain, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Reasoning panel — collapsible "working notes" surfaced during answer
 * synthesis. API-compatible with the nexus-ui/reasoning component
 * (https://nexus-ui.dev/docs/components/reasoning) so callers can swap
 * to the upstream version later via `npx shadcn add @nexus-ui/reasoning`
 * without touching the call sites.
 *
 * One honest caveat vs the upstream: the upstream renders the model's
 * actual reasoning channel (from Claude extended thinking, DeepSeek R1,
 * etc.). Echo's query pipeline uses `streamObject` over gpt-4o-mini /
 * Gemini Flash / Mistral / Haiku — none expose a reasoning stream. So
 * the content here is synthesized narration of what the synthesis has
 * surfaced so far: "Pulled N memories", "Identified theme: pricing",
 * "Confidence: medium". Working notes, not model thought. Labelled
 * accordingly to avoid misrepresentation.
 */

interface ReasoningContextValue {
  isStreaming: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

function useReasoningContext() {
  const ctx = useContext(ReasoningContext);
  if (!ctx)
    throw new Error("Reasoning subcomponents must be inside <Reasoning>");
  return ctx;
}

export function Reasoning({
  isStreaming = false,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  className,
  children,
}: {
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const isControlled = openProp !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = isControlled ? !!openProp : uncontrolledOpen;

  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  // Auto-open while streaming, auto-close ~1.2s after streaming ends
  // (uncontrolled mode only — controlled callers manage their own state).
  useEffect(() => {
    if (isControlled) return;
    if (isStreaming) {
      setUncontrolledOpen(true);
      return;
    }
    const t = window.setTimeout(() => setUncontrolledOpen(false), 1200);
    return () => window.clearTimeout(t);
  }, [isStreaming, isControlled]);

  return (
    <ReasoningContext.Provider value={{ isStreaming, open, setOpen }}>
      <div
        className={cn(
          "rounded-2xl border border-border bg-card/40 transition",
          isStreaming && "border-foreground/20 bg-card/60",
          className,
        )}
      >
        {children}
      </div>
    </ReasoningContext.Provider>
  );
}

export function ReasoningTrigger({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  const { isStreaming, open, setOpen } = useReasoningContext();
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      className={cn(
        "flex w-full items-center gap-2 rounded-2xl px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground transition hover:bg-muted/40",
        isStreaming && "text-foreground/80",
        className,
      )}
    >
      <Brain
        size={13}
        strokeWidth={1.75}
        className={cn(
          "shrink-0",
          isStreaming && "animate-pulse text-foreground",
        )}
      />
      <span
        className={cn(
          "flex-1 truncate normal-case tracking-normal",
          isStreaming && "shimmer-text",
        )}
      >
        {children ?? (isStreaming ? "Echo is reasoning…" : "Working notes")}
      </span>
      <ChevronDown
        size={13}
        strokeWidth={1.75}
        className={cn("shrink-0 transition-transform", open && "rotate-180")}
      />
      <ShimmerStyle />
    </button>
  );
}

export function ReasoningContent({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const { open } = useReasoningContext();
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className="overflow-hidden"
        >
          <div
            className={cn(
              "border-t border-border/60 px-4 py-3 text-[12px] leading-relaxed text-muted-foreground",
              className,
            )}
          >
            <pre className="whitespace-pre-wrap font-sans">{children}</pre>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Minimal shimmer keyframes — equivalent to tw-shimmer's gradient
// sweep but inlined so we don't pull a one-off dep just for this.
function ShimmerStyle() {
  return (
    <style jsx global>{`
      @keyframes echo-reasoning-shimmer {
        0% {
          background-position: -200% 0;
        }
        100% {
          background-position: 200% 0;
        }
      }
      .shimmer-text {
        background: linear-gradient(
          90deg,
          var(--muted-foreground) 0%,
          var(--foreground) 50%,
          var(--muted-foreground) 100%
        );
        background-size: 200% 100%;
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        animation: echo-reasoning-shimmer 2.4s linear infinite;
      }
    `}</style>
  );
}
