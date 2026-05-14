"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * bklit-style chart primitives used by the bento dashboard. Pure
 * SVG + CSS — no recharts dependency for these, keeps the chunk
 * small and the look distinct from a generic data viz.
 *
 *   - TierDonut       : 5-segment donut with center label
 *   - SubmissionsBarList : horizontal bar list (top forms by count)
 *   - MiniBars        : compact bar sparkline for submission distribution
 *   - RingGauge       : large circular progress ring
 *
 * All charts animate on mount via Framer Motion path animations.
 */

// ──────────────────────────────────────────────────────────────────
// TierDonut — 5-segment donut chart
// ──────────────────────────────────────────────────────────────────

// Frame tier palette — five steps of foreground opacity instead of the
// pastel rainbow. Tier 0 reads loudest (Public, highest volume),
// dropping to a barely-there tint for the rarest tier. Works in both
// light and dark themes because the values are CSS rgba on each theme
// foreground; consumers wrap in `style={{ color: var(--foreground) }}`
// where possible, but the absolute hex below approximates for stroke /
// background attributes that don't honor currentColor.
const TIER_OPACITY = [0.86, 0.66, 0.5, 0.36, 0.22];
const TIER_HEX = [
  "rgba(10,10,10,0.86)",
  "rgba(10,10,10,0.66)",
  "rgba(10,10,10,0.5)",
  "rgba(10,10,10,0.36)",
  "rgba(10,10,10,0.22)",
];

const TIER_LABELS = ["Public", "Admin", "M-of-N", "Time", "Cond"];

export function TierDonut({
  tierCounts,
  size = 152,
  thickness = 14,
  centerLabel,
  centerSub,
}: {
  tierCounts: Record<number, number>;
  size?: number;
  thickness?: number;
  centerLabel: string;
  centerSub?: string;
}) {
  const total = Object.values(tierCounts).reduce((a, b) => a + b, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  // Compute each segment's offset + length on the circle
  let cumulative = 0;
  const segments = [0, 1, 2, 3, 4].map((tier) => {
    const count = tierCounts[tier] ?? 0;
    const fraction = total === 0 ? 0 : count / total;
    const length = fraction * circumference;
    const offset = cumulative;
    cumulative += length;
    return { tier, count, length, offset };
  });

  return (
    <div
      className="relative flex shrink-0 items-center justify-center text-foreground"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)" }}
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.10"
          strokeWidth={thickness}
        />
        {/* Segments — currentColor lets the chart inherit `text-foreground`
            so the same chart works in light + dark themes. Each tier
            uses its opacity step from TIER_OPACITY. */}
        {segments.map((seg) =>
          seg.length === 0 ? null : (
            <motion.circle
              key={seg.tier}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeOpacity={TIER_OPACITY[seg.tier]}
              strokeWidth={thickness}
              strokeLinecap="butt"
              strokeDasharray={`${seg.length} ${circumference}`}
              initial={{ strokeDashoffset: -seg.offset, opacity: 0 }}
              animate={{ strokeDashoffset: -seg.offset, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.1 + seg.tier * 0.08 }}
            />
          ),
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-3xl font-medium leading-none tabular-nums tracking-tight text-foreground">
          {centerLabel}
        </div>
        {centerSub && (
          <div className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {centerSub}
          </div>
        )}
      </div>
    </div>
  );
}

export function TierLegend({
  tierCounts,
  className,
}: {
  tierCounts: Record<number, number>;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5 text-sm", className)}>
      {TIER_LABELS.map((label, i) => (
        <div key={label} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-[2px] bg-foreground"
              style={{ opacity: TIER_OPACITY[i] }}
              aria-hidden="true"
            />
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {label}
            </span>
          </div>
          <span className="font-mono text-sm font-medium tabular-nums text-foreground">
            {tierCounts[i] ?? 0}
          </span>
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// SubmissionsBarList — bklit-style horizontal bar list
// ──────────────────────────────────────────────────────────────────

export function SubmissionsBarList({
  items,
  max,
}: {
  items: Array<{
    id: string;
    title: string;
    value: number;
    tier: number;
    icon?: LucideIcon;
    href?: string;
  }>;
  max?: number;
}) {
  const computedMax = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item, idx) => {
        const pct = Math.min(100, (item.value / computedMax) * 100);
        const Icon = item.icon;
        const Content = (
          <>
            <div className="flex items-center justify-between gap-3 text-sm">
              <div className="flex min-w-0 items-center gap-2.5 text-foreground">
                {Icon && (
                  <Icon
                    size={15}
                    strokeWidth={1.75}
                    style={{ opacity: TIER_OPACITY[item.tier] }}
                    aria-hidden="true"
                  />
                )}
                <span className="truncate font-medium text-foreground">
                  {item.title}
                </span>
              </div>
              <span className="shrink-0 font-mono text-sm font-medium tabular-nums text-foreground">
                {item.value.toLocaleString()}
              </span>
            </div>
            <div className="relative h-1.5 w-full overflow-hidden rounded-[2px] bg-foreground/[0.06]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{
                  duration: 0.8,
                  delay: 0.1 + idx * 0.06,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="absolute inset-y-0 left-0 rounded-[2px] bg-foreground"
                style={{ opacity: TIER_OPACITY[item.tier] }}
              />
            </div>
          </>
        );
        return (
          <li key={item.id} className="flex flex-col gap-1.5">
            {item.href ? (
              <Link
                href={item.href}
                className="flex flex-col gap-1.5 rounded-md transition hover:opacity-80"
              >
                {Content}
              </Link>
            ) : (
              Content
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ──────────────────────────────────────────────────────────────────
// MiniBars — small bar sparkline showing per-form distribution
// ──────────────────────────────────────────────────────────────────

export function MiniBars({
  values,
  height = 48,
  gap = 3,
}: {
  values: number[];
  height?: number;
  gap?: number;
}) {
  const max = Math.max(1, ...values);
  return (
    <div
      className="flex w-full items-end"
      style={{ height, gap }}
      role="img"
      aria-label={`Distribution across ${values.length} forms`}
    >
      {values.map((v, i) => {
        const h = Math.max(2, (v / max) * height);
        return (
          <motion.div
            key={i}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: h, opacity: 1 }}
            transition={{
              duration: 0.6,
              delay: 0.1 + i * 0.03,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="flex-1 rounded-sm bg-foreground/30"
            style={{ minWidth: 4 }}
          />
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// RingGauge — large circular progress ring
// ──────────────────────────────────────────────────────────────────

export function RingGauge({
  value,
  max = 100,
  size = 96,
  thickness = 10,
  color = "#A78BFA",
  label,
}: {
  value: number;
  max?: number;
  size?: number;
  thickness?: number;
  color?: string;
  label?: string;
}) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.min(1, Math.max(0, value / max));
  const offset = circumference * (1 - fraction);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.10"
          strokeWidth={thickness}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-xl font-medium tabular-nums leading-none tracking-tight text-foreground">
          {value}
          {max === 100 ? "%" : ""}
        </span>
        {label && (
          <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// AnimatedDelta — number that ticks up + shows weekly delta
// ──────────────────────────────────────────────────────────────────

export function AnimatedDelta({
  value,
  delta,
  label,
  href,
}: {
  value: number;
  delta?: number;
  label?: string;
  href?: string;
}) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const duration = 900;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  const content = (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-medium tabular-nums leading-none tracking-tight text-foreground">
          {display.toLocaleString()}
        </span>
        {delta !== undefined && delta !== 0 && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums",
              delta > 0
                ? "bg-emerald-600/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"
                : "bg-rose-600/10 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300",
            )}
          >
            {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}
          </span>
        )}
      </div>
      {label && (
        <span className="text-sm text-muted-foreground">{label}</span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group inline-flex items-center gap-2 transition hover:opacity-80"
      >
        {content}
        <ArrowRight
          size={14}
          className="text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground"
        />
      </Link>
    );
  }
  return content;
}
