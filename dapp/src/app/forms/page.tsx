import type { Metadata } from "next";
import { EchoFormsRedesign } from "./EchoFormsRedesign";

export const metadata: Metadata = {
  title: "My forms · Echo",
  description: "Forms you own on Echo.",
};

export const runtime = "edge";

/**
 * /forms — Echo redesign per `~/Downloads/web_memwal/forms.jsx`.
 * Bypasses the prior AppShell + FormList chain so the new editorial
 * layout owns the whole viewport.
 */
export default function FormsListPage() {
  return <EchoFormsRedesign />;
}
