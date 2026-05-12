import { Globe, Lock, Users, Clock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Privacy-tier badge — same visual language wherever a form's tier is
 * surfaced (admin headers, dashboard tile, marketing privacy section,
 * tier-gated viewer states). Single source of truth for tier color +
 * icon + label.
 */

export const TIER_META = [
  {
    label: "Public",
    short: "Public",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    icon: Globe,
  },
  {
    label: "Admin only",
    short: "Admin",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    icon: Lock,
  },
  {
    label: "Threshold m-of-n",
    short: "M-of-N",
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/30",
    icon: Users,
  },
  {
    label: "Time-locked",
    short: "Time",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    icon: Clock,
  },
  {
    label: "Conditional",
    short: "Cond",
    color: "text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/30",
    icon: ShieldCheck,
  },
] as const;

export function TierChip({
  tier,
  variant = "full",
  className,
}: {
  tier: number;
  variant?: "full" | "icon" | "short";
  className?: string;
}) {
  const meta = TIER_META[tier] ?? TIER_META[0];
  const Icon = meta.icon;
  if (variant === "icon") {
    return (
      <Icon
        size={16}
        strokeWidth={1.75}
        className={cn(meta.color, className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        meta.color,
        meta.bg,
        meta.border,
        className,
      )}
    >
      <Icon size={11} strokeWidth={2} />
      {variant === "short" ? meta.short : meta.label}
    </span>
  );
}
