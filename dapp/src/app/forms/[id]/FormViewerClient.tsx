"use client";

import dynamic from "next/dynamic";
import { useResolvedFormId } from "@/lib/echo/useResolvedFormId";

const FormViewerInner = dynamic(
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

/**
 * Wrapper that resolves the actual form id at hydration time. On the
 * Walrus Sites build there's only one statically-prerendered form page
 * at /forms/_/; the host serves it as a fallback for any /forms/<id>/
 * URL via ws-resources.yaml. When that happens the prop says "_" but
 * window.location.pathname has the real id — useResolvedFormId picks
 * whichever is correct.
 */
export const FormViewer = ({ formId }: { formId: string }) => {
  const resolved = useResolvedFormId(formId);
  if (!resolved) {
    return <p className="text-sm text-muted-foreground">Loading form…</p>;
  }
  return <FormViewerInner formId={resolved} />;
};
