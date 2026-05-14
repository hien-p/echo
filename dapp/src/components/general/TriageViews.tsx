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
      {/* Frame outline rail wrapping the toggle — no card chrome, square
          rail, inverse plate slides under the active option. */}
      <div className="inline-flex items-center overflow-hidden rounded-sm border border-foreground/30">
        {VIEWS.map((v) => {
          const Icon = v.icon;
          const active = current === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onChange(v.id)}
              className={cn(
                "relative inline-flex items-center gap-1.5 px-3.5 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] transition-colors",
                active
                  ? "text-background"
                  : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
              )}
              aria-pressed={active}
            >
              {active && (
                <motion.span
                  layoutId="triage-view-pill"
                  className="absolute inset-0 bg-foreground"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <span className="relative inline-flex items-center gap-1.5">
                <Icon size={12} strokeWidth={1.75} />
                {v.label}
              </span>
            </button>
          );
        })}
      </div>
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground tabular-nums">
        {total} submission{total === 1 ? "" : "s"} in scope
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Identicon — Frame monochrome variant (single initial, hairline disc).
// ──────────────────────────────────────────────────────────────────

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
        className="inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-foreground/30 font-mono text-foreground/45"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.46,
        }}
      >
        ?
      </span>
    );
  }
  // Frame identicon — single mono initial on a hairline outlined disc.
  // The previous version generated saturated conic-gradient HSL discs
  // which clashed with the near-monochrome architectural palette.
  // Initial is derived from the address bytes so it's deterministic but
  // value-bearing (vs an opaque hash circle).
  const initial = (address.replace(/^0x/, "")[0] ?? "0").toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-foreground/25 bg-background font-mono font-medium text-foreground/70"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        letterSpacing: 0,
      }}
    >
      {initial}
    </span>
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

const TIER_HEX = ["#0A0A0A", "#2F6BFF", "#8A8A85", "#B5781A", "#B53334"];

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
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
      {statuses.map((s, sIdx) => {
        const items = grouped[s.value] ?? [];
        return (
          <div
            key={s.value}
            className="flex flex-col gap-3 rounded-sm border border-foreground/15 bg-card/40 p-3"
          >
            {/* Frame column header — mono uppercase tracked label, inverse
                plate for NEW (matches the table row badge surface). Count
                stays mono tabular. */}
            <div className="flex items-center justify-between gap-2 px-1 pt-1">
              <span
                className={cn(
                  "rounded-full border font-mono",
                  "px-3 py-[5px] text-[10px] font-medium uppercase tracking-[0.16em]",
                  s.chip,
                )}
              >
                {s.label}
              </span>
              <span className="font-mono text-[10px] font-medium tabular-nums tracking-[0.06em] text-muted-foreground">
                {items.length}
              </span>
            </div>
            <ul className="flex flex-col gap-2">
              {items.length === 0 ? (
                <li className="flex h-20 items-center justify-center rounded-sm border border-dashed border-foreground/15 bg-background/50 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
                  Empty
                </li>
              ) : (
                items.map((r, idx) => {
                  const t = smartTime(r.submittedAt);
                  const tierColor = TIER_HEX[r.formTier] ?? "#64748B";
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
                        className="group relative flex w-full flex-col gap-2 rounded-sm border border-foreground/15 bg-background p-3 text-left transition hover:border-foreground/40 hover:bg-foreground/[0.035]"
                        title="Click to cycle status"
                        style={{
                          borderLeftWidth: 3,
                          borderLeftColor: tierColor,
                        }}
                      >
                        {/* Top row: identicon + handle + lock */}
                        <div className="flex items-center gap-2">
                          <Identicon
                            address={r.submitter}
                            anonymous={r.anonymous}
                            size={22}
                          />
                          <span className="truncate text-sm font-semibold text-foreground">
                            {r.anonymous ? (
                              <em className="font-serif font-normal text-muted-foreground">
                                anonymous
                              </em>
                            ) : (
                              <SuiNSName address={r.submitter} />
                            )}
                          </span>
                          {r.encrypted && (
                            <Lock
                              size={12}
                              strokeWidth={2}
                              className="ml-auto shrink-0 text-[#B5781A]"
                              aria-label="encrypted"
                            />
                          )}
                        </div>
                        {/* Form title */}
                        <Link
                          href={`/forms/${r.formId}/admin`}
                          className="truncate text-[12.5px] leading-snug text-foreground/75 hover:text-foreground hover:underline"
                          onClick={(e) => e.stopPropagation()}
                          title={r.formTitle}
                        >
                          {r.formTitle}
                        </Link>
                        {/* Bottom row: timestamp + tier dot + arrow */}
                        <div className="flex items-center justify-between gap-2 pt-0.5 font-mono text-[10px] tabular-nums tracking-[0.06em] uppercase text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              aria-hidden="true"
                              className="inline-block h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: tierColor }}
                            />
                            <span className="font-medium text-foreground/85">
                              {t.day}
                            </span>
                            <span>{t.hms}</span>
                          </span>
                          <Link
                            href={`/forms/${r.formId}/admin`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-foreground/40 opacity-0 transition group-hover:translate-x-0.5 group-hover:text-foreground group-hover:opacity-100"
                            aria-label="open in form admin"
                          >
                            <ArrowUpRight size={13} />
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

    const totalCells = Math.ceil((now.getTime() - start.getTime()) / day);
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

  // Frame palette: blueprint blue #2F6BFF for active cells, hairline
  // border for empty cells so the grid stays visible in light theme.
  // Empty fill is transparent so the border outline does the lifting.
  const intensity = (n: number) => {
    if (n === 0) return "transparent";
    const t = Math.min(1, n / max);
    const alpha = 0.22 + t * 0.78;
    return `rgba(47,107,255,${alpha.toFixed(3)})`;
  };

  return (
    <div className="flex flex-col gap-5 rounded-sm border border-foreground/15 bg-card/40 p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
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
      {/* Single fade-in on the grid container — was 371 per-cell motion
          divs which racked up framer-motion registrations and stalled
          first paint. Cells are pure inline-styled divs now. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-x-auto"
      >
        <div className="inline-flex gap-[3px] pr-2">
          {weeks.map((week, wIdx) => (
            <div key={wIdx} className="flex flex-col gap-[3px]">
              {week.map((cell, dIdx) => (
                <div
                  key={dIdx}
                  title={`${cell.date.toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })} · ${cell.count} submission${cell.count === 1 ? "" : "s"}`}
                  className={cn(
                    "rounded-[2px]",
                    cell.count === 0 && "border border-foreground/10",
                  )}
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
      </motion.div>
      <div className="flex items-center justify-end gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        <span>Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <span
            key={t}
            className={cn(
              "h-3 w-3 rounded-[2px]",
              t === 0 && "border border-foreground/15",
            )}
            style={{
              background:
                t === 0
                  ? "transparent"
                  : `rgba(47,107,255,${(0.22 + t * 0.78).toFixed(3)})`,
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
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
          {value}
        </span>
        {sub && (
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            {sub}
          </span>
        )}
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
      {
        address: string;
        count: number;
        tiers: Record<number, number>;
        anon: boolean;
      }
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
    <div className="flex flex-col gap-5 rounded-sm border border-foreground/15 bg-card/40 p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
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
          <li className="rounded-sm border border-dashed border-foreground/20 px-4 py-6 text-center font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            No contributors yet
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
                        <em className="font-serif font-normal text-muted-foreground">
                          anonymous
                        </em>
                      ) : (
                        <SuiNSName address={r.address} />
                      )}
                    </span>
                    {/* Tier ticks — kept as monochrome bars using
                        foreground opacity to encode count share. Tier
                        identity itself is conveyed by the cell tooltip;
                        Frame palette stays neutral. */}
                    <div className="hidden items-center gap-1 sm:flex">
                      {tierEntries.map(({ tier, n }) => (
                        <span
                          key={tier}
                          title={`${n} on tier ${tier}`}
                          className="inline-block h-1.5 w-3 rounded-[2px] bg-foreground"
                          style={{
                            opacity: 0.25 + (n / r.count) * 0.45,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-sm font-medium tabular-nums text-foreground">
                      {r.count}
                    </span>
                    <span className="font-mono text-[10px] tabular-nums uppercase tracking-[0.06em] text-muted-foreground">
                      {Math.round((r.count / total) * 100)}%
                    </span>
                  </div>
                </div>
                {/* Frame bar — flat monochrome fill, square-ish corners.
                    Blueprint blue could go on the top spot but feels
                    loud; foreground at 80% opacity reads as clean ink
                    on paper. */}
                <div className="relative h-1.5 w-full overflow-hidden rounded-[2px] bg-foreground/[0.06]">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{
                      duration: 0.8,
                      delay: 0.05 * idx,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-[2px]",
                      r.anon ? "bg-foreground/35" : "bg-foreground/80",
                    )}
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

// Frame: no per-card accent colors. Each card is a hairline-outlined
// plate. The blueprint blue accent only appears on the "Ask Insights"
// chevron of the focused card, mirroring how Frame uses --accent sparingly.
const INSIGHT_PROMPTS = [
  {
    title: "Top complaints this week",
    prompt: "What are the top 3 complaints across all submissions this week?",
  },
  {
    title: "Most-asked feature",
    prompt:
      "Which feature requests appear most often? Group similar requests together.",
  },
  {
    title: "Sentiment trend",
    prompt:
      "How has the sentiment of submissions trended over the past 30 days?",
  },
  {
    title: "Anonymous vs named patterns",
    prompt:
      "What patterns differ between anonymous and named submissions? Are anonymous ones more critical?",
  },
];

export function InsightsView({ submissionCount }: { submissionCount: number }) {
  return (
    <div className="flex flex-col gap-5 rounded-sm border border-foreground/15 bg-card/40 p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Memwal RAG · ask your forms
          </span>
          <span className="text-sm text-muted-foreground">
            Pick a preset to open <em className="font-serif">Insights</em> with
            a query already drafted.
          </span>
        </div>
        <Link
          href="/insights"
          className="inline-flex items-center gap-1.5 rounded-sm border border-foreground/40 px-3.5 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-foreground transition hover:bg-foreground hover:text-background"
        >
          Open Insights <ArrowUpRight size={12} />
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
              className="group relative flex h-full flex-col gap-2 rounded-sm border border-foreground/15 bg-background/60 p-4 transition hover:border-foreground/40 hover:bg-background"
            >
              <span className="text-base font-medium text-foreground">
                {p.title}
              </span>
              <span className="text-sm text-muted-foreground">
                &ldquo;{p.prompt}&rdquo;
              </span>
              <span className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-foreground/55 transition group-hover:text-[#2F6BFF] dark:group-hover:text-[#6B95FF]">
                Ask Insights <ArrowUpRight size={10} />
              </span>
            </Link>
          </motion.div>
        ))}
      </div>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {submissionCount} submission{submissionCount === 1 ? "" : "s"} in scope
        · Memwal RAG over decrypted snippets · public tier by default ·
        encrypted forms need Seal session key
      </p>
    </div>
  );
}
