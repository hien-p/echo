"use client";

import dynamic from "next/dynamic";

export const CrossFormDashboardClient = dynamic(
  () =>
    import("@/components/general/CrossFormDashboard").then((mod) => ({
      default: mod.CrossFormDashboard,
    })),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-muted-foreground">Loading dashboard…</p>
    ),
  },
);

export const BentoDashboardClient = dynamic(
  () =>
    import("@/components/general/BentoDashboard").then((mod) => ({
      default: mod.BentoDashboard,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[420px] animate-pulse rounded-2xl bg-muted/40" />
    ),
  },
);
