import type { Metadata } from "next";
import { FormAdmin } from "./FormAdminClient";

export const runtime = "edge";

type Params = { id: string };

// See ../page.tsx — generateStaticParams + dynamicParams are injected
// by scripts/build-walrus.sh at static-export time. CF Pages keeps
// edge runtime and runtime-resolves the id.

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Admin · ${id.slice(0, 10)}… · Echo`,
  };
}

export default async function FormAdminPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  return (
    <section className="flex flex-col gap-md max-w-[960px] mx-auto p-md w-full">
      <FormAdmin formId={id} />
    </section>
  );
}
