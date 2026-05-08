"use client";

import { useEffect, useState } from "react";
import { Lock, Unlock as UnlockIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Live "🔓 Unlocks in 4d 12h" / "🔓 Unlocked" badge for TimeLocked forms.
 *
 * Re-renders every 30 seconds while pre-unlock; once `now >= unlockMs`
 * the badge stops ticking. Pure derived UI — no on-chain reads.
 */
export function TimeLockBadge({
  unlockMs,
  className,
}: {
  unlockMs: number;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (now >= unlockMs) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [now, unlockMs]);

  const isUnlocked = now >= unlockMs;
  const Icon = isUnlocked ? UnlockIcon : Lock;
  const label = isUnlocked
    ? "Unlocked"
    : `Unlocks ${humanRelative(unlockMs - now)}`;
  const absolute = new Date(unlockMs).toLocaleString();

  return (
    <span
      title={absolute}
      className={cn(
        "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border",
        isUnlocked
          ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
        className,
      )}
    >
      <Icon size={11} />
      {label}
    </span>
  );
}

function humanRelative(deltaMs: number): string {
  if (deltaMs <= 0) return "now";
  const min = Math.floor(deltaMs / 60_000);
  const hr = Math.floor(min / 60);
  const days = Math.floor(hr / 24);
  if (days > 0) return `in ${days}d ${hr % 24}h`;
  if (hr > 0) return `in ${hr}h ${min % 60}m`;
  if (min > 0) return `in ${min}m`;
  return "in <1m";
}
