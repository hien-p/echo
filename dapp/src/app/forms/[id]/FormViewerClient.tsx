"use client";

import dynamic from "next/dynamic";

export const FormViewer = dynamic(
  () =>
    import("@/components/general/FormViewer").then((mod) => ({
      default: mod.FormViewer,
    })),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-muted-foreground">Loading form…</p>
    ),
  },
);
