"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle,
  Heart,
  Lightbulb,
  Plus,
  Sparkles,
  Telescope,
  TrendingUp,
  UserCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Goals rail — preset + custom user-defined goals per form. Clicking a
 * goal fills the question textarea and fires the query. Custom goals
 * persist to localStorage keyed by form id (or "all" for cross-form).
 *
 * The point of "goals" vs ad-hoc questions: goals are reusable. The
 * user revisits the same question across time (e.g. "Track sentiment
 * trend") rather than typing it from scratch. Encourages structured,
 * repeated insight extraction instead of one-shot asks.
 */

export interface InsightsGoal {
  id: string;
  label: string;
  prompt: string;
  /** "preset" goals are baked-in defaults; "custom" goals come from localStorage. */
  kind: "preset" | "custom";
  /** Lucide icon name to render — only for presets. */
  icon?: keyof typeof PRESET_ICONS;
}

const PRESET_ICONS = {
  AlertTriangle,
  Heart,
  Lightbulb,
  Sparkles,
  Telescope,
  TrendingUp,
  UserCheck,
} as const;

const PRESET_GOALS: InsightsGoal[] = [
  {
    id: "preset-top-complaints",
    kind: "preset",
    icon: "AlertTriangle",
    label: "Top complaints",
    prompt:
      "What are the 3 most common complaints across these submissions? Group similar gripes and rank by frequency. Quote one verbatim line per complaint.",
  },
  {
    id: "preset-feature-requests",
    kind: "preset",
    icon: "Lightbulb",
    label: "Feature requests",
    prompt:
      "List every distinct feature request mentioned. Group near-duplicates, count submissions, and rank by demand.",
  },
  {
    id: "preset-sentiment-trend",
    kind: "preset",
    icon: "TrendingUp",
    label: "Sentiment trend",
    prompt:
      "Summarise the overall sentiment across these submissions. Break down what is positive, neutral, and negative — with citations.",
  },
  {
    id: "preset-personas",
    kind: "preset",
    icon: "UserCheck",
    label: "Persona clusters",
    prompt:
      "Cluster the respondents into 2-4 distinct personas based on tone, focus, and intent. For each persona, give a name, count, and one-line characterisation.",
  },
  {
    id: "preset-outliers",
    kind: "preset",
    icon: "Telescope",
    label: "Outliers",
    prompt:
      "Which submissions stand apart from the rest — contrary views, unusual depth, or edge cases? Pick the top 2 and explain what makes each unique.",
  },
  {
    id: "preset-anon-vs-named",
    kind: "preset",
    icon: "Heart",
    label: "Anonymous vs named",
    prompt:
      "Do anonymous respondents differ from named ones in tone, topics, or sentiment? If yes, where? If no, say so plainly.",
  },
];

const STORAGE_KEY = (scopeKey: string) => `echo:insights-goals:${scopeKey}`;

function loadCustomGoals(scopeKey: string): InsightsGoal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY(scopeKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (g): g is InsightsGoal =>
        !!g &&
        typeof g === "object" &&
        typeof (g as InsightsGoal).id === "string" &&
        typeof (g as InsightsGoal).label === "string" &&
        typeof (g as InsightsGoal).prompt === "string",
    );
  } catch {
    return [];
  }
}

function saveCustomGoals(scopeKey: string, goals: InsightsGoal[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY(scopeKey), JSON.stringify(goals));
  } catch {
    /* private mode / quota */
  }
}

export function InsightsGoals({
  scopeKey,
  onPick,
  disabled,
}: {
  /** Form id (or "all" for cross-form). Custom goals are scoped to this. */
  scopeKey: string;
  /** Caller fires the query with the goal's prompt. */
  onPick: (prompt: string) => void;
  disabled?: boolean;
}) {
  const [customGoals, setCustomGoals] = useState<InsightsGoal[]>([]);
  const [adding, setAdding] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftPrompt, setDraftPrompt] = useState("");

  useEffect(() => {
    if (!scopeKey) return;
    setCustomGoals(loadCustomGoals(scopeKey));
  }, [scopeKey]);

  const allGoals = useMemo(
    () => [...PRESET_GOALS, ...customGoals],
    [customGoals],
  );

  const addGoal = () => {
    const label = draftLabel.trim();
    const prompt = draftPrompt.trim() || draftLabel.trim();
    if (!label) return;
    const next: InsightsGoal[] = [
      ...customGoals,
      {
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind: "custom",
        label,
        prompt,
      },
    ];
    setCustomGoals(next);
    saveCustomGoals(scopeKey, next);
    setDraftLabel("");
    setDraftPrompt("");
    setAdding(false);
  };

  const removeGoal = (id: string) => {
    const next = customGoals.filter((g) => g.id !== id);
    setCustomGoals(next);
    saveCustomGoals(scopeKey, next);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Goals
          </span>
          <span className="text-xs text-muted-foreground/80">
            Click a goal to ask it. Custom goals save per form.
          </span>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
        >
          <Plus size={12} strokeWidth={2} />
          {adding ? "Cancel" : "Add goal"}
        </button>
      </div>

      {adding && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex flex-col gap-2 rounded-2xl border border-border bg-card/80 p-3"
        >
          <input
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            placeholder="Goal name (e.g. Track NPS)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
          />
          <textarea
            value={draftPrompt}
            onChange={(e) => setDraftPrompt(e.target.value)}
            placeholder="Prompt to send when clicked (optional — defaults to the name)"
            rows={2}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setDraftLabel("");
                setDraftPrompt("");
              }}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={addGoal}
              disabled={!draftLabel.trim()}
              className="rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background disabled:opacity-50"
            >
              Save goal
            </button>
          </div>
        </motion.div>
      )}

      <div className="flex flex-wrap gap-2">
        {allGoals.map((g) => {
          const Icon =
            g.kind === "preset" && g.icon ? PRESET_ICONS[g.icon] : Sparkles;
          return (
            <motion.div
              key={g.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="group relative"
            >
              <button
                type="button"
                onClick={() => onPick(g.prompt)}
                disabled={disabled}
                title={g.prompt}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition",
                  "border-border bg-card/60 text-foreground/85 hover:border-foreground/35 hover:bg-card hover:text-foreground",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  g.kind === "custom" && "pr-8",
                )}
              >
                <Icon
                  size={13}
                  strokeWidth={2}
                  className="text-foreground/55"
                />
                {g.label}
              </button>
              {g.kind === "custom" && (
                <button
                  type="button"
                  onClick={() => removeGoal(g.id)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground opacity-0 transition hover:bg-foreground/10 hover:text-foreground group-hover:opacity-100"
                  aria-label="Remove goal"
                  title="Remove this goal"
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
