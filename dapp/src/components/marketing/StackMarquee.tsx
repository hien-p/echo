"use client";

import type { ReactNode } from "react";
import { Database, Lock, ShieldCheck, Zap, Brain, Cloud } from "lucide-react";

/**
 * Infinite horizontal marquee of the stack Echo is built on. Six items
 * (Walrus / Sui / Seal / Memwal / Enoki / Cloudflare) rendered twice
 * so the seam during the -50% translate is invisible. CSS keyframe
 * `marquee-x` lives in globals.css.
 *
 * Adapted from wireframe LogoMarquee but switched from vertical
 * scroll-column to single horizontal row — Echo's stack list is short
 * and reads better in one line. Lucide icons stand in for real brand
 * marks (we don't have a logo licence dance to do for a hackathon).
 */

interface StackItem {
  name: string;
  icon: typeof Database;
  blurb: string;
}

const stack: StackItem[] = [
  { name: "Walrus", icon: Database, blurb: "decentralized blob storage" },
  { name: "Sui", icon: ShieldCheck, blurb: "object-centric L1" },
  { name: "Seal", icon: Lock, blurb: "threshold encryption" },
  { name: "Memwal", icon: Brain, blurb: "RAG over submissions" },
  { name: "Enoki", icon: Zap, blurb: "gas-sponsored tx" },
  { name: "Cloudflare", icon: Cloud, blurb: "edge runtime" },
];

export function StackMarquee(): ReactNode {
  return (
    <section
      aria-label="Built on"
      className="relative overflow-hidden border-y border-border bg-background py-10"
    >
      <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-24 bg-gradient-to-r from-background to-transparent sm:w-40" />
      <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-24 bg-gradient-to-l from-background to-transparent sm:w-40" />

      <div
        className="flex w-max items-center gap-12 [animation:marquee-x_40s_linear_infinite] sm:gap-20"
        // Pause animation on hover so a curious user can read the stack
        onMouseEnter={(e) => {
          e.currentTarget.style.animationPlayState = "paused";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.animationPlayState = "running";
        }}
      >
        {[...stack, ...stack].map((item, i) => (
          <StackBadge key={`${item.name}-${i}`} item={item} />
        ))}
      </div>
    </section>
  );
}

function StackBadge({ item }: { item: StackItem }) {
  const Icon = item.icon;
  return (
    <div className="flex shrink-0 items-center gap-3 text-foreground/70 transition hover:text-foreground">
      <Icon size={22} strokeWidth={1.5} aria-hidden="true" />
      <span className="text-lg font-medium tracking-tight sm:text-xl">
        {item.name}
      </span>
      <span className="hidden text-xs text-foreground/40 sm:inline">
        · {item.blurb}
      </span>
    </div>
  );
}
