"use client";

import { FormAdmin as FormAdminInner } from "@/components/general/FormAdmin";
import { useResolvedFormId } from "@/lib/echo/useResolvedFormId";

/**
 * Per-form admin wrapper. Resolves the form id (handles Walrus Sites
 * SPA-fallback case where prop is "_" but window.location has real
 * id), then mounts the existing FormAdmin detail panel.
 *
 * Direct import — no nested dynamic({ssr:false}). See deep-solver
 * report for the @cloudflare/next-on-pages async-chunk bug.
 *
 * Note: the editorial Synex-style hero lives on /dashboard (the
 * global admin overview), NOT here. Per-form admin keeps the dense
 * detail-panel aesthetic.
 */
export const FormAdmin = ({ formId }: { formId: string }) => {
  const resolved = useResolvedFormId(formId);
  if (!resolved) {
    return (
      <p className="p-md text-sm text-muted-foreground">Loading admin view…</p>
    );
  }
  return <FormAdminInner formId={resolved} />;
};
