"use client";

import { Pin, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InsightAnswerData } from "./InsightAnswer";

/**
 * Pinned insights — stored in localStorage per owner address. Rendered
 * as a compact row above the Insights hero. Click a card to expand it
 * back into the main answer slot. Skips Bento dashboard wiring entirely
 * (that needs a real persistence layer — localStorage is the demo
 * surface only).
 */

export interface PinnedInsight {
  formId: string;
  formTitle: string | null;
  question: string;
  answerExcerpt: string;
  topThemes: string[];
  timestamp: number;
  /** Full InsightAnswerData snapshot so expand-on-click is offline. */
  data: InsightAnswerData;
}

const PIN_MAX = 6;
export const pinKey = (owner: string | undefined) =>
  owner ? `echo:insights:pinned:${owner.toLowerCase()}` : "";

export function readPinned(owner: string | undefined): PinnedInsight[] {
  if (typeof window === "undefined" || !owner) return [];
  try {
    const raw = window.localStorage.getItem(pinKey(owner));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PinnedInsight[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writePinned(
  owner: string | undefined,
  pin: PinnedInsight,
): PinnedInsight[] {
  if (typeof window === "undefined" || !owner) return [];
  const existing = readPinned(owner);
  const filtered = existing.filter(
    (p) => !(p.formId === pin.formId && p.question === pin.question),
  );
  const next = [pin, ...filtered].slice(0, PIN_MAX);
  try {
    window.localStorage.setItem(pinKey(owner), JSON.stringify(next));
  } catch {
    /* quota — silent */
  }
  return next;
}

export function removePinned(
  owner: string | undefined,
  formId: string,
  question: string,
): PinnedInsight[] {
  if (typeof window === "undefined" || !owner) return [];
  const existing = readPinned(owner);
  const next = existing.filter(
    (p) => !(p.formId === formId && p.question === question),
  );
  try {
    window.localStorage.setItem(pinKey(owner), JSON.stringify(next));
  } catch {
    /* */
  }
  return next;
}

export function isPinned(
  owner: string | undefined,
  formId: string,
  question: string,
): boolean {
  return readPinned(owner).some(
    (p) => p.formId === formId && p.question === question,
  );
}

export function PinnedRow({
  pinned,
  onExpand,
  onRemove,
}: {
  pinned: PinnedInsight[];
  onExpand: (data: InsightAnswerData) => void;
  onRemove: (formId: string, question: string) => void;
}) {
  if (pinned.length === 0) return null;
  return (
    <div className="mx-4 mt-4 sm:mx-8 lg:mx-12">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        <Pin size={10} strokeWidth={2} />
        Pinned · {pinned.length}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {pinned.map((p) => (
          <PinnedCard
            key={`${p.formId}-${p.timestamp}`}
            pin={p}
            onExpand={() => onExpand(p.data)}
            onRemove={() => onRemove(p.formId, p.question)}
          />
        ))}
      </div>
    </div>
  );
}

function PinnedCard({
  pin,
  onExpand,
  onRemove,
}: {
  pin: PinnedInsight;
  onExpand: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative flex w-[280px] shrink-0 flex-col gap-1.5 rounded-2xl border border-border bg-card/60 p-3 transition hover:border-foreground/30 hover:bg-card",
      )}
    >
      <button
        type="button"
        onClick={onExpand}
        className="flex flex-col items-start gap-1.5 text-left"
      >
        <span className="line-clamp-1 text-xs font-medium text-foreground">
          {pin.question}
        </span>
        <span className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
          {pin.answerExcerpt}
        </span>
        <div className="mt-1 flex flex-wrap gap-1">
          {pin.topThemes.slice(0, 3).map((t) => (
            <span
              key={t}
              className="rounded-full bg-muted px-1.5 py-px text-[9px] uppercase tracking-wider text-muted-foreground"
            >
              {t}
            </span>
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground/70">
          {pin.formTitle ?? pin.formId.slice(0, 10) + "…"}
        </span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Unpin"
        className="absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-background/80 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground group-hover:opacity-100"
      >
        <X size={10} strokeWidth={2} />
      </button>
    </div>
  );
}
