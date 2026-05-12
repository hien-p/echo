"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { CONTAINER_APP } from "./containers";
import { EASE_OUT } from "./motionPresets";

/**
 * Standard wrapper for non-marketing interior routes.
 *
 * Provides:
 *   - Top padding to clear the fixed NavPill (mounted in layout)
 *   - Centered max-width container (defaults to CONTAINER_APP = 1280px;
 *     pass `width="wide"` for 1440px or `width="narrow"` for 768px)
 *   - Optional header slot with kicker + title + subtitle
 *   - Fade-in entry on the content
 *
 * Use it like:
 *   <AppShell title="Dashboard" subtitle="Cross-form triage queue.">
 *     <BentoDashboard />
 *     <CrossFormDashboard />
 *   </AppShell>
 */
export function AppShell({
  children,
  title,
  subtitle,
  kicker,
  actions,
  width = "default",
  className,
}: {
  children: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  kicker?: React.ReactNode;
  actions?: React.ReactNode;
  width?: "default" | "wide" | "narrow";
  className?: string;
}) {
  const widthCls =
    width === "wide"
      ? "max-w-[1440px]"
      : width === "narrow"
        ? "max-w-[768px]"
        : CONTAINER_APP;

  return (
    <section
      className={cn(
        "mx-auto flex w-full flex-col gap-8 px-4 pb-24 pt-28 sm:px-8 sm:pt-32",
        widthCls,
        className,
      )}
    >
      {(title || subtitle || kicker) && (
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
          className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-6"
        >
          <div className="flex flex-col gap-2">
            {kicker && (
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {kicker}
              </span>
            )}
            {title && (
              <h1 className="text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="max-w-[680px] text-sm text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          )}
        </motion.header>
      )}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: EASE_OUT, delay: 0.05 }}
      >
        {children}
      </motion.div>
    </section>
  );
}
