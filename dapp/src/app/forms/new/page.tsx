import type { Metadata } from "next";
import { AppShell } from "@/components/shell";
import { FormBuilder } from "./FormBuilderClient";

export const metadata: Metadata = {
  title: "New form · Echo",
  description:
    "Build a Walrus-backed feedback form with on-chain composability.",
};

export default function NewFormPage() {
  return (
    <AppShell
      kicker="Build"
      title="New form"
      subtitle="Schema and metadata land on Walrus; the on-chain Form anchors the blob IDs, owner cap, and privacy tier. Try ✨ AI generate at the top to start from a prompt."
      width="wide"
    >
      <FormBuilder />
    </AppShell>
  );
}
