"use client";

import { motion } from "motion/react";
import { useId, useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

interface DataPoint {
  /** Bucket label (e.g. "Apr 24"). Used as the chart's x-domain. */
  label: string;
  /** Submissions in this bucket. */
  value: number;
}

interface PerformanceChartProps {
  data: DataPoint[];
}

/**
 * Echo-themed area chart. Pulses two visual effects on top of Recharts:
 *
 * 1. A vertical scanning line (thin blue gradient) traversing left→right
 *    on a 5s loop. Sits absolute-positioned over the chart so it's not
 *    constrained by Recharts' SVG.
 * 2. A blue gradient fill from #60A5FA down to transparent.
 *
 * Chart has zero axes/grid — this is a "moodlight" chart, not a precision
 * one. Numbers belong in the parent card's stat header.
 */
export function PerformanceChart({ data }: PerformanceChartProps) {
  const gradId = useId().replace(/[:]/g, "");

  // Empty / single-point guard. Recharts renders nothing useful with <2 pts;
  // fall back to a placeholder shape so the bottom half doesn't go blank.
  const series = useMemo(() => {
    if (data.length >= 2) return data;
    return Array.from({ length: 12 }, (_, i) => ({
      label: `${i}`,
      value: 1 + Math.sin(i / 1.5) * 0.5 + i / 6,
    }));
  }, [data]);

  return (
    <div className="relative h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={series}
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient
              id={`perf-fill-${gradId}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#60A5FA" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#60A5FA" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke="#60A5FA"
            strokeWidth={1.5}
            strokeOpacity={0.85}
            fill={`url(#perf-fill-${gradId})`}
            isAnimationActive
            animationDuration={1100}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Scanning line. Animate `left: 0% → 100%` so the line traverses
          the chart container regardless of width. The parent card has
          overflow-hidden so any 1px sliver beyond 100% is clipped. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-px bg-gradient-to-b from-transparent via-blue-400 to-transparent opacity-80"
        animate={{ left: ["0%", "100%"] }}
        transition={{
          duration: 5,
          ease: "linear",
          repeat: Infinity,
          repeatType: "loop",
        }}
      />
    </div>
  );
}
