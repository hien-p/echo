"use client";

import { Database } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Indexing pipeline state shared between the SSE event stream and the
 * progress widget. The route emits per-submission events tagged with the
 * current pipeline stage (fetch_walrus → decrypt → embed). The widget
 * doesn't model stages as completed/pending because each submission
 * passes through all of them — instead it shows a single linear bar
 * driven by current/total submissions.
 */
export type IndexingStage =
  | "query_events"
  | "fetch_walrus"
  | "decrypt"
  | "embed"
  | "done";

export interface IndexingProgressState {
  stage: IndexingStage;
  /** Submissions completed so far. */
  current: number;
  /** Total submissions to process. */
  total: number;
  /** Human-readable status line. */
  message?: string;
  /** Running counters surfaced once received from the stream. */
  indexed?: number;
  deduped?: number;
  skipped?: number;
}

const STAGE_HINT: Record<IndexingStage, string> = {
  query_events: "Reading chain",
  fetch_walrus: "Fetching Walrus",
  decrypt: "Decrypting",
  embed: "Indexing to Memwal",
  done: "Done",
};

export function IndexingProgressStrip({
  progress,
}: {
  progress: IndexingProgressState;
}) {
  const pct =
    progress.total > 0
      ? Math.min(100, Math.round((progress.current / progress.total) * 100))
      : progress.stage === "done"
        ? 100
        : 0;
  const isDone = progress.stage === "done";

  return (
    <div className="w-full max-w-[560px] space-y-2">
      <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 truncate">
          <Database
            size={11}
            className={cn(
              isDone ? "text-emerald-500" : "animate-pulse text-foreground/60",
            )}
          />
          <span className="truncate">
            {progress.message ?? STAGE_HINT[progress.stage]}
          </span>
        </span>
        {progress.total > 0 && (
          <span className="shrink-0 font-mono tabular-nums text-foreground/70">
            {progress.current} / {progress.total}
          </span>
        )}
      </div>

      <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            isDone ? "bg-emerald-500" : "bg-foreground/70",
          )}
        />
      </div>

      {(progress.indexed != null ||
        progress.deduped != null ||
        progress.skipped != null) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground/80">
          {progress.indexed != null && (
            <span>
              <span className="font-mono tabular-nums text-foreground/80">
                {progress.indexed}
              </span>{" "}
              indexed
            </span>
          )}
          {progress.deduped ? (
            <span>
              <span className="font-mono tabular-nums">{progress.deduped}</span>{" "}
              deduped
            </span>
          ) : null}
          {progress.skipped ? (
            <span>
              <span className="font-mono tabular-nums">{progress.skipped}</span>{" "}
              skipped
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
