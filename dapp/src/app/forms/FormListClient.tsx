"use client";

import dynamic from "next/dynamic";

export const FormList = dynamic(
  () =>
    import("@/components/general/FormList").then((mod) => ({
      default: mod.FormList,
    })),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-muted-foreground">Loading your forms…</p>
    ),
  },
);
