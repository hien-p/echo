"use client";

/**
 * /forms/[id] — Public form-filler shell.
 *
 * The FormViewer component now owns the full viewport (slim topbar +
 * stepped flow + footer arrows) per the Frame×MemWal×Sui form-filler
 * design. This shell is intentionally minimal: it just passes the form
 * id through. Earlier versions wrapped the viewer in a hero + footer,
 * but the new design's takeover treatment makes that wrapping fight the
 * fullscreen stepper.
 */

import { FormViewer } from "./FormViewerClient";

export function EchoFormViewerShell({ formId }: { formId: string }) {
  return <FormViewer formId={formId} />;
}
