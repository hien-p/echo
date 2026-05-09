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
