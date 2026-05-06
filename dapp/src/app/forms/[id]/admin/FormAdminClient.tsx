"use client";

import dynamic from "next/dynamic";

export const FormAdmin = dynamic(
  () =>
    import("@/components/general/FormAdmin").then((mod) => ({
      default: mod.FormAdmin,
    })),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-muted-foreground">Loading admin view…</p>
    ),
  },
);
