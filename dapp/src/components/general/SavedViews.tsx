"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Bookmark, BookmarkCheck, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Saved views — captures the current filter combination as a named
 * preset. Persisted to localStorage scoped per wallet address. Lives
 * above the triage queue and lets operators flip between e.g.
 * "Encrypted, last 7 days" and "Anonymous only" with one click.
 *
 * sui-stack-crm called these out as the single biggest day-to-day
 * usability gap in their roadmap; same applies to Echo's triage queue.
 */

export interface SavedView {
  id: string;
  name: string;
  /** Snapshot of the four filter state fields — keep narrow + JSON-safe. */
  filters: {
    searchTerm: string;
    statusFilter: string;
    formFilter: string;
    submitterFilter: string;
  };
}

const STORAGE_KEY = (owner: string | undefined) =>
  `echo:saved-views:${owner ?? "anon"}`;

function loadViews(owner: string | undefined): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY(owner));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is SavedView =>
        !!v &&
        typeof v === "object" &&
        typeof (v as SavedView).id === "string" &&
        typeof (v as SavedView).name === "string" &&
        !!(v as SavedView).filters,
    );
  } catch {
    return [];
  }
}

function saveViews(owner: string | undefined, views: SavedView[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY(owner), JSON.stringify(views));
  } catch {
    /* private mode / quota */
  }
}

function describe(filters: SavedView["filters"]): string {
  const bits: string[] = [];
  if (filters.searchTerm) bits.push(`"${filters.searchTerm}"`);
  if (filters.statusFilter !== "all") bits.push(filters.statusFilter);
  if (filters.formFilter !== "all") bits.push("one form");
  if (filters.submitterFilter !== "all") bits.push(filters.submitterFilter);
  return bits.join(" · ") || "no filters";
}

export function SavedViews({
  ownerAddress,
  current,
  onApply,
}: {
  /** Wallet/demo address used to scope persistence. */
  ownerAddress: string | undefined;
  /** Live filter snapshot from the parent. */
  current: SavedView["filters"];
  /** Apply a saved view's filters to the parent state. */
  onApply: (filters: SavedView["filters"]) => void;
}) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [naming, setNaming] = useState(false);
  const [draftName, setDraftName] = useState("");

  useEffect(() => {
    setViews(loadViews(ownerAddress));
  }, [ownerAddress]);

  // Detect whether the current filter set matches any saved view —
  // gives the active view its "selected" highlight.
  const activeId = useMemo(() => {
    for (const v of views) {
      const f = v.filters;
      if (
        f.searchTerm === current.searchTerm &&
        f.statusFilter === current.statusFilter &&
        f.formFilter === current.formFilter &&
        f.submitterFilter === current.submitterFilter
      ) {
        return v.id;
      }
    }
    return null;
  }, [views, current]);

  const filtersDirty =
    current.searchTerm !== "" ||
    current.statusFilter !== "all" ||
    current.formFilter !== "all" ||
    current.submitterFilter !== "all";

  const saveCurrent = () => {
    const name = draftName.trim();
    if (!name) return;
    const next: SavedView[] = [
      ...views,
      {
        id: `view-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        filters: { ...current },
      },
    ];
    setViews(next);
    saveViews(ownerAddress, next);
    setDraftName("");
    setNaming(false);
  };

  const removeView = (id: string) => {
    const next = views.filter((v) => v.id !== id);
    setViews(next);
    saveViews(ownerAddress, next);
  };

  if (views.length === 0 && !filtersDirty && !naming) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <Bookmark size={11} strokeWidth={2.25} />
          Saved views
        </span>

        {views.map((v) => {
          const active = v.id === activeId;
          return (
            <motion.div
              key={v.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="group relative"
            >
              <button
                type="button"
                onClick={() => onApply(v.filters)}
                title={describe(v.filters)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 pr-6 text-xs font-medium transition",
                  active
                    ? "border-foreground/40 bg-foreground/10 text-foreground"
                    : "border-border bg-card/40 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                )}
              >
                {active && (
                  <BookmarkCheck size={11} strokeWidth={2.25} />
                )}
                {v.name}
              </button>
              <button
                type="button"
                onClick={() => removeView(v.id)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground opacity-0 transition hover:bg-foreground/10 hover:text-foreground group-hover:opacity-100"
                aria-label="Remove view"
                title="Remove this view"
              >
                <X size={10} strokeWidth={2.5} />
              </button>
            </motion.div>
          );
        })}

        {filtersDirty && !naming && (
          <button
            type="button"
            onClick={() => setNaming(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-foreground/30 px-3 py-1 text-xs font-medium text-muted-foreground transition hover:border-foreground/50 hover:text-foreground"
          >
            <Plus size={11} strokeWidth={2.25} />
            Save current filters
          </button>
        )}
      </div>

      {naming && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="flex items-center gap-2 overflow-hidden"
        >
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveCurrent();
              } else if (e.key === "Escape") {
                setNaming(false);
                setDraftName("");
              }
            }}
            placeholder={`Name this view (e.g. "Encrypted, anonymous")`}
            className="flex-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-foreground/40"
          />
          <button
            type="button"
            onClick={saveCurrent}
            disabled={!draftName.trim()}
            className="rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setNaming(false);
              setDraftName("");
            }}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </motion.div>
      )}
      {filtersDirty && (
        <p className="px-1 text-[10px] text-muted-foreground/70">
          {describe(current)}
        </p>
      )}
    </div>
  );
}
