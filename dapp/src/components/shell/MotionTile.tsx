"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { EASE_OUT } from "./motionPresets";

/**
 * Bento tile primitive — used in BentoDashboard and any other
 * grid surface that wants a consistent rounded-2xl border + optional
 * gradient overlay + fade-up entry. Extracted from BentoDashboard so
 * dashboard, reputation, insights, and forms list can all use the
 * same tile vocabulary.
 */
export function MotionTile({
  children,
  className,
  delay = 0,
  gradient,
  hover = true,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  /** Tailwind gradient class chain, e.g. "from-blue-500/20 via-blue-500/5 to-transparent" */
  gradient?: string;
  /** Whether to lift the border on hover. Default true; set false for static surfaces. */
  hover?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT, delay }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-card",
        hover && "transition hover:border-foreground/20",
        className,
      )}
    >
      {gradient && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-60 transition group-hover:opacity-100",
            gradient,
          )}
          aria-hidden="true"
        />
      )}
      <div className="relative z-10 flex h-full flex-col">{children}</div>
    </motion.div>
  );
}
