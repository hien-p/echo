"use client";

import { Suspense } from "react";
import Link from "next/link";
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
  if (resolved === null) {
    return (
      <p className="p-md text-sm text-muted-foreground">Loading admin view…</p>
    );
  }
  if (resolved === "") {
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
  // FormAdminInner reads `?focus=` via useSearchParams() — wrap in Suspense
  // so the static prerender doesn't bail out (same constraint as /insights).
  return (
    <Suspense fallback={null}>
      <FormAdminInner formId={resolved} />
    </Suspense>
  );
};
