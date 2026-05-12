"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { EASE_OUT } from "./motionPresets";

/**
 * Oversized clamp-sized headline with motion entry. Mirrors the agency
 * template's hero / section headlines but reusable across any route.
 *
 * Pass an `accent` prop to render an italic-serif sub-line (uses
 * --font-serif → Instrument Serif). Set `size="lg" | "xl"` to swap
 * between section-header and hero scale.
 */
export function DisplayHeading({
  children,
  accent,
  size = "lg",
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  accent?: React.ReactNode;
  size?: "lg" | "xl";
  className?: string;
  delay?: number;
}) {
  const sizeCls =
    size === "xl"
      ? "text-[clamp(3rem,8vw,9rem)]"
      : "text-[clamp(2rem,5vw,5rem)]";

  return (
    <motion.h2
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, ease: EASE_OUT, delay }}
      className={cn(
        "font-medium leading-[1.05] tracking-tight text-foreground text-balance",
        sizeCls,
        className,
      )}
    >
      {children}
      {accent && (
        <>
          <br />
          <em className="font-serif text-foreground/70">{accent}</em>
        </>
      )}
    </motion.h2>
  );
}
