"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Quote, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Slide-in right panel showing a single submission in full. Opened by
 * clicking a citation row in InsightAnswer. The query route ships the
 * full memory text alongside the structured response so this is a
 * synchronous render — no fetch on open.
 */

export interface CitationSheetData {
  submissionId: string;
  text: string;
  /** Optional — the excerpt shown in the citation list, highlighted in
   *  the full text when present. */
  highlight?: string;
}

export function CitationSheet({
  data,
  onClose,
}: {
  data: CitationSheetData | null;
  onClose: () => void;
}) {
  // Close on Escape, prevent background scroll while open.
  useEffect(() => {
    if (!data) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [data, onClose]);

  return (
    <AnimatePresence>
      {data && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm"
            aria-hidden="true"
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={`Submission ${data.submissionId}`}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col border-l border-border bg-card shadow-2xl shadow-foreground/20"
          >
            <header className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                <Quote size={12} />
                Submission
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition hover:border-foreground/40 hover:bg-muted hover:text-foreground"
              >
                <X size={14} strokeWidth={1.75} />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <code className="block break-all text-[11px] text-muted-foreground">
                {data.submissionId}
              </code>
              <article className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {data.highlight ? (
                  <HighlightedText text={data.text} needle={data.highlight} />
                ) : (
                  data.text
                )}
              </article>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function HighlightedText({ text, needle }: { text: string; needle: string }) {
  // Highlight every occurrence of `needle` (case-insensitive). Falls back
  // to plain text when needle is empty or not present.
  const trimmed = needle.trim();
  if (!trimmed) return <>{text}</>;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) =>
        re.test(p) ? (
          <mark
            key={i}
            className={cn(
              "rounded bg-amber-200/60 px-0.5 dark:bg-amber-500/20",
            )}
          >
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
