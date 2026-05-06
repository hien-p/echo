"use client";

import dynamic from "next/dynamic";

// FormBuilder pulls @mysten/walrus which depends on a wasm binary that
// can't be resolved during Next.js static export. Lazy-load it client-side
// only. Wrapped in a client boundary so `ssr: false` is allowed.
export const FormBuilder = dynamic(
  () =>
    import("@/components/general/FormBuilder").then((mod) => ({
      default: mod.FormBuilder,
    })),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-muted-foreground">Loading form builder…</p>
    ),
  },
);
