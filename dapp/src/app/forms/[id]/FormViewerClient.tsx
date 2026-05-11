"use client";

import { FormViewer as FormViewerInner } from "@/components/general/FormViewer";
import { useResolvedFormId } from "@/lib/echo/useResolvedFormId";

/**
 * Wrapper that resolves the actual form id at hydration time. On the
 * Walrus Sites build there's only one statically-prerendered page at
 * /forms/_/; the host serves it as a fallback for any /forms/<id>/
 * URL via ws-resources.yaml. When that happens the prop says "_" but
 * window.location.pathname has the real id — useResolvedFormId picks
 * whichever is correct.
 *
 * Imports FormViewer directly (not via next/dynamic) — nested
 * dynamic({ ssr: false }) wrappers under React 19 + the
 * @cloudflare/next-on-pages edge runtime trigger
 * "ReferenceError: async__chunk_<id> is not defined" because the
 * generated async chunk loader stub doesn't get emitted into the
 * worker bundle. Since this file is already "use client", FormViewer
 * runs client-side regardless; the dynamic wrapper was redundant.
 */
export const FormViewer = ({ formId }: { formId: string }) => {
  const resolved = useResolvedFormId(formId);
  if (!resolved) {
    return <p className="text-sm text-muted-foreground">Loading form…</p>;
  }
  return <FormViewerInner formId={resolved} />;
};
