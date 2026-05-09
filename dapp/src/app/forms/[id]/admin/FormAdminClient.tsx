"use client";

import dynamic from "next/dynamic";
import { useResolvedFormId } from "@/lib/echo/useResolvedFormId";

const FormAdminInner = dynamic(
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

/**
 * Wrapper that resolves the actual form id at hydration time. See
 * ../FormViewerClient.tsx for why we have to read window.location instead
 * of trusting the route param on the Walrus Sites SPA-fallback build.
 */
export const FormAdmin = ({ formId }: { formId: string }) => {
  const resolved = useResolvedFormId(formId);
  if (!resolved) {
    return <p className="text-sm text-muted-foreground">Loading admin view…</p>;
  }
  return <FormAdminInner formId={resolved} />;
};
