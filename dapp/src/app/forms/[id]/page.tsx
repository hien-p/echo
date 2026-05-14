import type { Metadata } from "next";
import { EchoFormViewerShell } from "./EchoFormViewerShell";

export const runtime = "edge";

type Params = { id: string };

// NOTE: scripts/build-walrus.sh INJECTS `generateStaticParams` +
// `dynamicParams = false` here at build time and strips the
// `runtime = "edge"` line above. Don't add either by hand — Next.js 15
// refuses both `runtime = "edge"` AND `generateStaticParams` in the
// same file, and the CF Pages build needs the edge runtime.

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
  return <EchoFormViewerShell formId={id} />;
}
