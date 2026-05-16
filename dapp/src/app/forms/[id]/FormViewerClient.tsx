"use client";

import Link from "next/link";
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
  if (resolved === null) {
    return <p className="text-sm text-muted-foreground">Loading form…</p>;
  }
  if (resolved === "") {
    // Lit the static SPA-fallback URL directly — no real form id to
    // query. Don't fire a Sui call with "_"; surface a friendly nudge.
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No form id in the URL. Pick one from your{" "}
          <Link href="/forms" className="underline">
            forms list
          </Link>
          .
        </p>
      </div>
    );
  }
  return <FormViewerInner formId={resolved} />;
};
