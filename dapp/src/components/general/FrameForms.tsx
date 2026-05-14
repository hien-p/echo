"use client";

/**
 * Frame Forms primitives — the cross-product layer that fuses
 *
 *   - Frame (wireframe structure: hairline rails, mono micro-text)
 *   - Sui   (color: Sea Blue focus rings, aurora signature gradient)
 *   - MemWal (character: cyan walrus mascot, brutalist offset CTA)
 *
 * Source kit: `~/Downloads/frames_/`. Tokens live as `--ff-*` in
 * `globals.css`; this file is the React surface. Three primitives —
 * everything composes from them so the brand stays consistent.
 *
 * 1. `<WalrusMascot pose=... size=...>` — drops the official mascot
 *    PNG with optional bobble animation. Uses `next/image` and a
 *    fixed aspect ratio per pose.
 * 2. `<AuroraPlate>` — wash + walrus full-bleed inside a frame.
 *    Reserved for empty states, success moments, hero plates.
 * 3. `<BrutalistButton>` — 2px ink border + offset shadow, with an
 *    optional aurora-strong fill. Reserved for on-chain commit
 *    moments per the Frame Forms rules.
 *
 * Plus `<Reveal>` (IntersectionObserver fade-up) so callers can opt
 * sections into the canonical 700ms cubic-bezier reveal without
 * pulling motion/react for every leaf.
 */

import Image from "next/image";
import * as React from "react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// 1. Walrus mascot
// ─────────────────────────────────────────────────────────────────

export type MascotPose =
  | "primary"
  | "salute"
  | "peace"
  | "monogram"
  | "haulout";

const MASCOT_SRC: Record<MascotPose, string> = {
  primary: "/assets/mascots/mascot-01-primary.png",
  salute: "/assets/mascots/mascot-02-salute.png",
  peace: "/assets/mascots/mascot-03-peace.png",
  monogram: "/assets/mascots/mascot-04-monogram.png",
  haulout: "/assets/mascots/mascot-05-haulout.png",
};

const MASCOT_SIZE_PX: Record<"sm" | "md" | "lg" | "xl", number> = {
  sm: 64,
  md: 120,
  lg: 200,
  xl: 320,
};

export function WalrusMascot({
  pose = "peace",
  size = "md",
  bobble = false,
  className,
  priority = false,
}: {
  pose?: MascotPose;
  size?: keyof typeof MASCOT_SIZE_PX | number;
  bobble?: boolean;
  className?: string;
  priority?: boolean;
}) {
  const px = typeof size === "number" ? size : MASCOT_SIZE_PX[size];
  return (
    <Image
      src={MASCOT_SRC[pose]}
      width={px}
      height={px}
      alt=""
      aria-hidden="true"
      priority={priority}
      className={cn(
        "select-none object-contain",
        bobble && "ff-bobble",
        className,
      )}
    />
  );
}

// ─────────────────────────────────────────────────────────────────
// 2. Aurora plate — soft signature wash with optional walrus
// ─────────────────────────────────────────────────────────────────

export function AuroraPlate({
  pose,
  intensity = "soft",
  shimmer = false,
  className,
  children,
}: {
  /** Omit to render the wash without a mascot. */
  pose?: MascotPose;
  /** `soft` for empty-state plates; `strong` for hero/CTA moments. */
  intensity?: "soft" | "strong";
  /** Slow background-position sweep across the gradient. */
  shimmer?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const background =
    intensity === "strong"
      ? "var(--ff-aurora-strong)"
      : "var(--ff-aurora-soft)";
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-sm border border-foreground/15",
        shimmer && "ff-aurora-shimmer",
        className,
      )}
      style={{ background }}
    >
      {pose && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-[55%]"
        >
          <WalrusMascot
            pose={pose}
            size="xl"
            className="absolute -bottom-6 -right-6 h-[120%] w-auto opacity-95"
          />
        </div>
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// 3. Brutalist button — on-chain commit affordance
// ─────────────────────────────────────────────────────────────────

export function BrutalistButton({
  children,
  onClick,
  href,
  aurora = false,
  size = "md",
  className,
  disabled,
  type = "button",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  /** Use aurora-strong gradient fill — reserved for the single primary
   *  action per surface (e.g. "Sign & publish"). */
  aurora?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
}) {
  const sizing =
    size === "sm"
      ? "px-3.5 py-1.5 text-[11px] tracking-[0.16em]"
      : size === "lg"
        ? "px-6 py-3 text-sm tracking-[0.14em]"
        : "px-5 py-2.5 text-xs tracking-[0.16em]";

  const base = cn(
    "group inline-flex items-center justify-center gap-2 rounded-[6px] border-2 border-foreground",
    "font-mono font-semibold uppercase transition-transform duration-200",
    "hover:-translate-x-[1px] hover:-translate-y-[1px] active:translate-x-[1px] active:translate-y-[1px]",
    sizing,
    aurora
      ? "text-foreground"
      : "bg-background text-foreground hover:bg-foreground hover:text-background",
    disabled && "cursor-not-allowed opacity-50 hover:translate-x-0 hover:translate-y-0",
    className,
  );

  const style: CSSProperties = {
    boxShadow: "var(--ff-shadow-brut)",
    ...(aurora ? { background: "var(--ff-aurora-strong)" } : {}),
  };

  if (href) {
    return (
      <a href={href} title={title} className={base} style={style}>
        {children}
      </a>
    );
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={base}
      style={style}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────
// 4. Reveal — IntersectionObserver fade-up
// ─────────────────────────────────────────────────────────────────

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  /** ms */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <motion.div
      ref={ref}
      initial={false}
      animate={{
        opacity: shown ? 1 : 0,
        y: shown ? 0 : 12,
      }}
      transition={{
        duration: 0.7,
        delay: delay / 1000,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────
// 5. Sui droplet — small inline icon for "Built on Sui" eyebrows
// ─────────────────────────────────────────────────────────────────

export function SuiDroplet({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size * 1.25}
      viewBox="0 0 32 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M16 0 C16 0 0 16 0 27 C0 34 7 40 16 40 C25 40 32 34 32 27 C32 16 16 0 16 0 Z"
        fill="url(#ff-sui-droplet-g)"
      />
      <defs>
        <linearGradient
          id="ff-sui-droplet-g"
          x1="0"
          y1="0"
          x2="0"
          y2="40"
        >
          <stop offset="0" stopColor="#6FBCF0" />
          <stop offset="1" stopColor="#2B7DD9" />
        </linearGradient>
      </defs>
    </svg>
  );
}
