import type { Metadata } from "next";
import { FormViewer } from "./FormViewerClient";

export const runtime = "edge";

type Params = { id: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Form ${id.slice(0, 10)}… · Echo`,
    description: "Submit feedback to a Walrus-backed Echo form.",
  };
}

export default async function FormPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  return (
    <section className="flex flex-col gap-md max-w-[768px] mx-auto p-md w-full">
      <FormViewer formId={id} />
    </section>
  );
}
