"use client";

import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { type MouseEvent, type ReactNode, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Swiss-utility bento card.
 *
 * - Mouse-tracking radial spotlight (600px circle, rgba(255,255,255,0.06))
 *   driven by motion values so the gradient updates on every frame
 *   without rerendering the React tree.
 * - Heavy-but-fast physics on hover: spring lift (y:-6, scale:1.005).
 * - Staggered entry: fade-up using a custom bezier curve.
 * - Subtle border ring(white/5) + dark gray bg (#0A0A0A).
 *
 * Layout is controlled by the caller via Tailwind col-span / row-span
 * classes on the `className` prop.
 */
interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  // Overlay padding can be disabled when a child needs full-bleed
  // (e.g. the PerformanceChart fills the bottom half).
  padded?: boolean;
}

const SPOTLIGHT_SIZE = 600;

export function SpotlightCard({
  children,
  className,
  delay = 0,
  padded = true,
}: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Raw mouse position relative to the card. We spring it so the
  // spotlight feels "heavy but fast" — same physics language as the
  // hover lift below.
  const mouseX = useMotionValue(-9999);
  const mouseY = useMotionValue(-9999);
  const x = useSpring(mouseX, { stiffness: 300, damping: 35, mass: 0.6 });
  const y = useSpring(mouseY, { stiffness: 300, damping: 35, mass: 0.6 });

  const background = useTransform([x, y], ([latestX, latestY]) => {
    return `radial-gradient(${SPOTLIGHT_SIZE}px circle at ${latestX}px ${latestY}px, rgba(255,255,255,0.06), transparent 40%)`;
  });

  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left);
    mouseY.set(e.clientY - rect.top);
  };

  const onMouseLeave = () => {
    // Park the spotlight off-card. Spring carries it out smoothly.
    mouseX.set(-9999);
    mouseY.set(-9999);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.7,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      whileHover={{ y: -6, scale: 1.005 }}
      // Physics: heavy but snappy. Stiff spring + slightly higher damping
      // keeps the lift from overshooting on rapid mouse-overs.
      style={{ transformOrigin: "center" }}
      className={cn(
        "group relative isolate overflow-hidden rounded-2xl bg-[#0A0A0A] ring-1 ring-white/5 transition-shadow duration-300 hover:ring-white/[0.09] hover:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.65)]",
        padded && "p-5",
        className,
      )}
    >
      {/* Mouse-driven spotlight. Sits above content's stacking context
          so it lights up edges and chips, not just background. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-300"
        style={{ background }}
      />
      <div className="relative z-0 flex h-full flex-col">{children}</div>
    </motion.div>
  );
}
