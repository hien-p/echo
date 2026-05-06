"use client";

import dynamic from "next/dynamic";

export const ReputationDashboard = dynamic(
  () =>
    import("@/components/general/ReputationDashboard").then((mod) => ({
      default: mod.ReputationDashboard,
    })),
  {
    ssr: false,
    loading: () => <p className="text-sm text-muted-foreground">Loading…</p>,
  },
);
