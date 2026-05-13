"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  Brain,
  Flame,
  Lock,
  Kanban as KanbanIcon,
  Table as TableIcon,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SuiNSName } from "./SuiNSName";

/**
 * Multi-view triage shell. The same `SubmissionRow[]` data is rendered
 * by five purpose-built views — Table, Kanban, Heatmap, Contributors,
 * Insights — switched by the pill at the top.
 *
 * The shape was confirmed via AskUserQuestion preview on 2026-05-13.
 * Caller (CrossFormDashboard) owns the `visible` array, status map,
 * and status updater; the views are pure presenters.
 */

// ──────────────────────────────────────────────────────────────────
// Shared types — duplicated from CrossFormDashboard to avoid an
// import cycle (CrossFormDashboard imports from TriageViews).
// ──────────────────────────────────────────────────────────────────

export interface TriageSubmission {
  formId: string;
  formTitle: string;
  formTier: number;
  submissionId: string;
  submitter: string;
  anonymous: boolean;
  submittedAt: string;
  payloadBlobId: string;
  encrypted: boolean;
}

export interface StatusDef {
  value: string;
  label: string;
  chip: string;
}

export type TriageView =
  | "table"
  | "kanban"
  | "heatmap"
  | "contributors"
  | "insights";

const VIEWS: Array<{
  id: TriageView;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}> = [
  { id: "table", label: "Table", icon: TableIcon },
  { id: "kanban", label: "Kanban", icon: KanbanIcon },
  { id: "heatmap", label: "Heatmap", icon: Flame },
  { id: "contributors", label: "Contributors", icon: Users },
  { id: "insights", label: "Insights", icon: Brain },
];

// ──────────────────────────────────────────────────────────────────
// Switcher pill
// ──────────────────────────────────────────────────────────────────

export function TriageViewSwitcher({
  current,
  onChange,
  total,
}: {
  current: TriageView;
  onChange: (next: TriageView) => void;
  total: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card/40 p-1 backdrop-blur">
        {VIEWS.map((v) => {
          const Icon = v.icon;
          const active = current === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onChange(v.id)}
              className={cn(
                "relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={active}
            >
              {active && (
                <motion.span
                  layoutId="triage-view-pill"
                  className="absolute inset-0 rounded-full bg-foreground/10"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative inline-flex items-center gap-1.5">
                <Icon size={14} strokeWidth={1.75} />
                {v.label}
              </span>
            </button>
          );
        })}
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">
        {total} submission{total === 1 ? "" : "s"} in scope
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Identicon — gradient circle generated deterministically from address
// ──────────────────────────────────────────────────────────────────

function identityHash(addr: string): { hue: number; hue2: number } {
  let h = 0;
  for (let i = 0; i < addr.length; i++) {
    h = (h * 31 + addr.charCodeAt(i)) >>> 0;
  }
  return { hue: h % 360, hue2: (h >> 8) % 360 };
}

export function Identicon({
  address,
  size = 22,
  anonymous = false,
}: {
  address: string;
  size?: number;
  anonymous?: boolean;
}) {
  if (anonymous) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-foreground/30 text-foreground/40"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.55,
          fontFamily: "var(--font-serif, serif)",
          fontStyle: "italic",
        }}
      >
        ?
      </span>
    );
  }
  const { hue, hue2 } = identityHash(address);
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(from 90deg at 50% 50%, hsl(${hue} 70% 60%), hsl(${hue2} 70% 55%), hsl(${hue} 70% 60%))`,
        boxShadow: `0 0 0 1px hsl(${hue} 60% 35% / 0.4)`,
      }}
    />
  );
}

// ──────────────────────────────────────────────────────────────────
// Smart timestamp — Today / Yesterday / Mon May 5 / 11:12
// ──────────────────────────────────────────────────────────────────

export function smartTime(iso: string): { day: string; hms: string } {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return { day: "—", hms: "" };
  const d = new Date(t);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  const isYest = d.toDateString() === yest.toDateString();
  const day = sameDay
    ? "Today"
    : isYest
      ? "Yesterday"
      : d.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });
  const hms = d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return { day, hms };
}

const TIER_HEX = ["#34D399", "#60A5FA", "#A78BFA", "#FBBF24", "#FB7185"];

// ──────────────────────────────────────────────────────────────────
// KANBAN — submissions grouped by status as columns
// ──────────────────────────────────────────────────────────────────

export function KanbanView({
  submissions,
  statusMap,
  cycleStatus,
  statuses,
}: {
  submissions: TriageSubmission[];
  statusMap: Record<string, string>;
  cycleStatus: (id: string) => void;
  statuses: StatusDef[];
}) {
  const grouped = useMemo(() => {
    const out: Record<string, TriageSubmission[]> = {};
    for (const s of statuses) out[s.value] = [];
    for (const r of submissions) {
      const k = statusMap[r.submissionId] ?? "new";
      (out[k] ?? out.new).push(r);
    }
    return out;
  }, [submissions, statusMap, statuses]);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {statuses.map((s, sIdx) => {
        const items = grouped[s.value] ?? [];
        return (
          <div
            key={s.value}
            className="flex flex-col gap-2 rounded-xl border border-border bg-card/40 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs font-medium uppercase tracking-wide",
                  s.chip,
                )}
              >
                {s.label}
              </span>
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                {items.length}
              </span>
            </div>
            <ul className="flex flex-col gap-2">
              {items.length === 0 ? (
                <li className="rounded-lg border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground">
                  Empty
                </li>
              ) : (
                items.map((r, idx) => {
                  const t = smartTime(r.submittedAt);
                  return (
                    <motion.li
                      key={r.submissionId}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.35,
                        delay: 0.02 * idx + 0.04 * sIdx,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => cycleStatus(r.submissionId)}
                        className="group flex w-full flex-col gap-2 rounded-lg border border-border/60 bg-card p-2.5 text-left transition hover:border-foreground/30 hover:bg-card/90"
                        title="Click to cycle status"
                        style={{
                          borderLeftWidth: 3,
                          borderLeftColor: TIER_HEX[r.formTier] ?? "#64748B",
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <Identicon
                            address={r.submitter}
                            anonymous={r.anonymous}
                            size={20}
                          />
                          <span className="truncate text-xs font-medium text-foreground">
                            {r.anonymous ? (
                              <em className="text-muted-foreground">
                                anonymous
                              </em>
                            ) : (
                              <SuiNSName address={r.submitter} />
                            )}
                          </span>
                          {r.encrypted && (
                            <Lock
                              size={11}
                              className="ml-auto text-amber-400/80"
                              aria-label="encrypted"
                            />
                          )}
                        </div>
                        <Link
                          href={`/forms/${r.formId}/admin`}
                          className="truncate text-[11px] text-muted-foreground hover:text-foreground"
                          onClick={(e) => e.stopPropagation()}
                          title={r.formTitle}
                        >
                          {r.formTitle}
                        </Link>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
                          <span>
                            {t.day} {t.hms}
                          </span>
                          <Link
                            href={`/forms/${r.formId}/admin`}
                            onClick={(e) => e.stopPropagation()}
                            className="opacity-0 transition group-hover:opacity-100"
                          >
                            <ArrowUpRight size={12} />
                          </Link>
                        </div>
                      </button>
                    </motion.li>
                  );
                })
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// HEATMAP — 52w × 7d activity grid (GitHub-style)
// ──────────────────────────────────────────────────────────────────

export function HeatmapView({
  submissions,
}: {
  submissions: TriageSubmission[];
}) {
  const { weeks, max, total, busiestDay, busiestCount } = useMemo(() => {
    const day = 24 * 60 * 60 * 1000;
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    // Anchor to start of week (Sunday) 52 weeks ago
    const start = new Date(now.getTime() - 52 * 7 * day);
    start.setHours(0, 0, 0, 0);
    while (start.getDay() !== 0) start.setDate(start.getDate() - 1);

    const totalCells = Math.ceil(
      (now.getTime() - start.getTime()) / day,
    );
    const counts = new Array(totalCells + 1).fill(0) as number[];
    for (const s of submissions) {
      const t = Date.parse(s.submittedAt);
      if (!Number.isFinite(t)) continue;
      if (t < start.getTime() || t > now.getTime()) continue;
      const idx = Math.floor((t - start.getTime()) / day);
      counts[idx] = (counts[idx] ?? 0) + 1;
    }
    const max = Math.max(1, ...counts);
    const total = counts.reduce((a, b) => a + b, 0);
    let busiestIdx = 0;
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] > counts[busiestIdx]) busiestIdx = i;
    }
    const busiestDay = new Date(start.getTime() + busiestIdx * day);

    // Lay out as columns of 7 (Sun..Sat)
    const weeks: Array<Array<{ count: number; date: Date }>> = [];
    for (let i = 0; i < counts.length; i += 7) {
      const col: Array<{ count: number; date: Date }> = [];
      for (let j = 0; j < 7; j++) {
        const idx = i + j;
        col.push({
          count: counts[idx] ?? 0,
          date: new Date(start.getTime() + idx * day),
        });
      }
      weeks.push(col);
    }
    return {
      weeks,
      max,
      total,
      busiestDay,
      busiestCount: counts[busiestIdx] ?? 0,
    };
  }, [submissions]);

  const intensity = (n: number) => {
    if (n === 0) return "rgba(255,255,255,0.06)";
    const t = Math.min(1, n / max);
    const alpha = 0.18 + t * 0.7;
    return `rgba(91,141,239,${alpha.toFixed(3)})`;
  };

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card/40 p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Activity heatmap · last 52 weeks
          </span>
          <span className="text-sm text-muted-foreground">
            One cell per day — darker means more submissions.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-5 text-sm">
          <Stat label="Total" value={total} />
          <Stat
            label="Busiest day"
            value={busiestCount}
            sub={busiestDay.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="inline-flex gap-[3px] pr-2">
          {weeks.map((week, wIdx) => (
            <div key={wIdx} className="flex flex-col gap-[3px]">
              {week.map((cell, dIdx) => (
                <motion.div
                  key={dIdx}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    duration: 0.25,
                    delay: 0.0008 * (wIdx * 7 + dIdx),
                  }}
                  title={`${cell.date.toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })} · ${cell.count} submission${cell.count === 1 ? "" : "s"}`}
                  className="rounded-[3px]"
                  style={{
                    width: 11,
                    height: 11,
                    background: intensity(cell.count),
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
        <span>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <span
            key={t}
            className="h-3 w-3 rounded-[3px]"
            style={{
              background: t === 0 ? "rgba(255,255,255,0.06)" : `rgba(91,141,239,${(0.18 + t * 0.7).toFixed(3)})`,
            }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-medium tabular-nums tracking-tight text-foreground">
          {value}
        </span>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// CONTRIBUTORS — leaderboard of submitters with bar fill
// ──────────────────────────────────────────────────────────────────

export function ContributorsView({
  submissions,
}: {
  submissions: TriageSubmission[];
}) {
  const { rows, total, anonCount, namedCount } = useMemo(() => {
    const map = new Map<
      string,
      { address: string; count: number; tiers: Record<number, number>; anon: boolean }
    >();
    let anonCount = 0;
    let namedCount = 0;
    for (const s of submissions) {
      if (s.anonymous) {
        anonCount += 1;
        const k = "__anon__";
        const cur = map.get(k) ?? {
          address: "anonymous",
          count: 0,
          tiers: {} as Record<number, number>,
          anon: true,
        };
        cur.count += 1;
        cur.tiers[s.formTier] = (cur.tiers[s.formTier] ?? 0) + 1;
        map.set(k, cur);
        continue;
      }
      namedCount += 1;
      const cur = map.get(s.submitter) ?? {
        address: s.submitter,
        count: 0,
        tiers: {} as Record<number, number>,
        anon: false,
      };
      cur.count += 1;
      cur.tiers[s.formTier] = (cur.tiers[s.formTier] ?? 0) + 1;
      map.set(s.submitter, cur);
    }
    const rows = Array.from(map.values()).sort((a, b) => b.count - a.count);
    return { rows, total: submissions.length, anonCount, namedCount };
  }, [submissions]);

  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card/40 p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Top contributors
          </span>
          <span className="text-sm text-muted-foreground">
            Ranked by total submissions across all forms in scope.
          </span>
        </div>
        <div className="flex items-center gap-5 text-sm">
          <Stat label="Named" value={namedCount} />
          <Stat label="Anonymous" value={anonCount} />
          <Stat label="Total" value={total} />
        </div>
      </div>
      <ul className="flex flex-col gap-3">
        {rows.length === 0 ? (
          <li className="rounded-lg border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
            No contributors yet.
          </li>
        ) : (
          rows.map((r, idx) => {
            const pct = (r.count / max) * 100;
            const tierEntries = Object.entries(r.tiers)
              .map(([tier, n]) => ({ tier: Number(tier), n }))
              .sort((a, b) => b.n - a.n);
            return (
              <li key={r.address} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Identicon
                      address={r.address}
                      anonymous={r.anon}
                      size={22}
                    />
                    <span className="truncate font-medium text-foreground">
                      {r.anon ? (
                        <em className="text-muted-foreground">anonymous</em>
                      ) : (
                        <SuiNSName address={r.address} />
                      )}
                    </span>
                    <div className="hidden items-center gap-1 sm:flex">
                      {tierEntries.map(({ tier, n }) => (
                        <span
                          key={tier}
                          title={`${n} on tier ${tier}`}
                          className="inline-block h-1.5 w-3 rounded-sm"
                          style={{
                            background: TIER_HEX[tier] ?? "#64748B",
                            opacity: 0.5 + (n / r.count) * 0.5,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-sm">
                    <span className="font-medium tabular-nums text-foreground">
                      {r.count}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {Math.round((r.count / total) * 100)}%
                    </span>
                  </div>
                </div>
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-foreground/5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{
                      duration: 0.8,
                      delay: 0.05 * idx,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      background: r.anon
                        ? "linear-gradient(90deg, #64748B, #94A3B8)"
                        : `linear-gradient(90deg, hsl(${identityHash(r.address).hue} 70% 55%), hsl(${identityHash(r.address).hue2} 70% 60%))`,
                    }}
                  />
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// INSIGHTS — preset prompt cards that deep-link to /insights
// ──────────────────────────────────────────────────────────────────

const INSIGHT_PROMPTS = [
  {
    title: "Top complaints this week",
    prompt: "What are the top 3 complaints across all submissions this week?",
    accent: "#FB7185",
  },
  {
    title: "Most-asked feature",
    prompt:
      "Which feature requests appear most often? Group similar requests together.",
    accent: "#A78BFA",
  },
  {
    title: "Sentiment trend",
    prompt:
      "How has the sentiment of submissions trended over the past 30 days?",
    accent: "#34D399",
  },
  {
    title: "Anonymous vs named patterns",
    prompt:
      "What patterns differ between anonymous and named submissions? Are anonymous ones more critical?",
    accent: "#60A5FA",
  },
];

export function InsightsView({
  submissionCount,
}: {
  submissionCount: number;
}) {
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card/40 p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Memwal RAG · ask your forms
          </span>
          <span className="text-sm text-muted-foreground">
            Pick a preset to open <em className="font-serif">Insights</em>{" "}
            with a query already drafted.
          </span>
        </div>
        <Link
          href="/insights"
          className="inline-flex items-center gap-1.5 rounded-full border border-foreground/20 bg-foreground/5 px-4 py-1.5 text-sm font-medium text-foreground transition hover:bg-foreground/10"
        >
          Open Insights <ArrowUpRight size={14} />
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {INSIGHT_PROMPTS.map((p, idx) => (
          <motion.div
            key={p.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 * idx }}
          >
            <Link
              href={`/insights?q=${encodeURIComponent(p.prompt)}`}
              className="group relative flex h-full flex-col gap-2 overflow-hidden rounded-xl border border-border bg-card/60 p-4 transition hover:border-foreground/20 hover:bg-card/80"
              style={{ "--accent": p.accent } as React.CSSProperties}
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-30 blur-2xl transition group-hover:opacity-60"
                style={{ background: p.accent }}
              />
              <span className="text-base font-medium text-foreground">
                {p.title}
              </span>
              <span className="text-sm text-muted-foreground">
                &ldquo;{p.prompt}&rdquo;
              </span>
              <span
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium"
                style={{ color: p.accent }}
              >
                Ask Insights <ArrowUpRight size={12} />
              </span>
            </Link>
          </motion.div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {submissionCount} submission{submissionCount === 1 ? "" : "s"} in
        scope. Insights uses Memwal RAG over decrypted snippets — public
        tier only by default; encrypted forms require a Seal session key.
      </p>
    </div>
  );
}
