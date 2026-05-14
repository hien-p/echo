import type { Metadata } from "next";
import { EchoFormBuilderShell } from "./EchoFormBuilderShell";

export const metadata: Metadata = {
  title: "New form · Echo",
  description:
    "Build a Walrus-backed feedback form with on-chain composability.",
};

export const runtime = "edge";

/**
 * /forms/new — Echo Form Builder per
 * `~/Downloads/memwal_newversion/form-builder.jsx`. Shell-only
 * rewrite: the working FormBuilder component (drag-drop, AI
 * generate, sponsored publish) is preserved verbatim inside the
 * Frame×MemWal×Sui paper theme.
 */
export default function NewFormPage() {
  return <EchoFormBuilderShell />;
}
