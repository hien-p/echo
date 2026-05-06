import type { Metadata } from "next";
import { FormBuilder } from "./FormBuilderClient";

export const metadata: Metadata = {
  title: "New form · Echo",
  description:
    "Build a Walrus-backed feedback form with on-chain composability.",
};

export default function NewFormPage() {
  return (
    <section className="flex flex-col gap-md max-w-[768px] mx-auto p-md w-full">
      <header>
        <h1 className="text-2xl font-semibold">New form</h1>
        <p className="text-sm text-muted-foreground">
          Schema and metadata land on Walrus; the on-chain Form anchors the blob
          IDs, owner cap, and privacy tier.
        </p>
      </header>
      <FormBuilder />
    </section>
  );
}
