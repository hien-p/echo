"use client";

import { animate, useMotionValue, useTransform, motion } from "motion/react";
import { useEffect } from "react";

/**
 * Odometer-style animated number. Springs from 0 → target on mount
 * (and on subsequent target changes). Used in the dashboard hero
 * pill so the count feels alive when the on-chain fetch resolves.
 */
export function CountUp({
  to,
  duration = 1.4,
  delay = 0,
}: {
  to: number;
  duration?: number;
  delay?: number;
}) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v).toLocaleString());

  useEffect(() => {
    const controls = animate(count, to, {
      duration,
      delay,
      ease: [0.22, 1, 0.36, 1],
    });
    return () => controls.stop();
  }, [count, to, duration, delay]);

  return <motion.span>{rounded}</motion.span>;
}
