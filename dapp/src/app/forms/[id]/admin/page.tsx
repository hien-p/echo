import type { Metadata } from "next";
import { EchoFormAdminShell } from "./EchoFormAdminShell";

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

/**
 * /forms/[id]/admin — Echo Form Admin per
 * `~/Downloads/memwal_newversion/form-admin.jsx`. Shell-only
 * rewrite: the working FormAdmin component (Seal session-key gate,
 * submission decryption, members ACL, webhooks, danger zone) is
 * preserved verbatim inside the Frame×MemWal×Sui paper theme.
 */
export default async function FormAdminPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  return <EchoFormAdminShell formId={id} />;
}
