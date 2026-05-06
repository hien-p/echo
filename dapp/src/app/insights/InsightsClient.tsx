"use client";

import dynamic from "next/dynamic";

export const InsightsConsole = dynamic(
  () =>
    import("@/components/general/InsightsConsole").then((mod) => ({
      default: mod.InsightsConsole,
    })),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-muted-foreground">Loading insights…</p>
    ),
  },
);
