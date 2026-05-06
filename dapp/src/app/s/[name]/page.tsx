import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const runtime = "edge";

type Params = { name: string };
type Search = { [k: string]: string | string[] | undefined };

export const metadata: Metadata = {
  title: "Echo · SuiNS shareable link",
};

const SUINS_API = "https://api-testnet.suins.io/api";
const FORM_ID_KEYS = ["app:echo:form_id", "echo:form_id", "form_id"];

interface SuiNSApiResponse {
  data?: {
    targetAddress?: string;
    contentHash?: string;
    avatar?: string;
    [key: string]: unknown;
  };
  targetAddress?: string;
}

async function resolveFormIdFromSuiNS(name: string): Promise<string | null> {
  try {
    const resp = await fetch(`${SUINS_API}/${encodeURIComponent(name)}`, {
      cache: "no-store",
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as SuiNSApiResponse;
    const data = json.data ?? {};
    for (const key of FORM_ID_KEYS) {
      const v = data[key];
      if (typeof v === "string" && v.startsWith("0x")) return v;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * SuiNS-branded shareable link. Visiting /s/feedback.firstmovers.sui:
 *   1. Tries `?to=0x…` override (manual share until on-chain mapping exists)
 *   2. Else queries SuiNS testnet API for the name's user_data
 *   3. Reads keys app:echo:form_id / echo:form_id / form_id
 *   4. Redirects to /forms/[id] if found, else renders setup instructions
 */
export default async function SuiNSShareablePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const [{ name }, sp] = await Promise.all([params, searchParams]);

  const override = typeof sp.to === "string" ? sp.to : undefined;
  if (override?.startsWith("0x")) redirect(`/forms/${override}`);

  const resolved = await resolveFormIdFromSuiNS(name);
  if (resolved) redirect(`/forms/${resolved}`);

  return (
    <section className="flex flex-col gap-md max-w-[640px] mx-auto p-md w-full">
      <header>
        <h1 className="text-2xl font-semibold">SuiNS resolver</h1>
        <p className="text-sm text-muted-foreground">
          <code>{name}</code>
        </p>
      </header>
      <div className="border rounded p-3 bg-amber-50 dark:bg-amber-950/30 text-sm flex flex-col gap-2">
        <p className="text-amber-700 dark:text-amber-400">
          No <code>app:echo:form_id</code> user-data found for{" "}
          <code>{name}</code>.
        </p>
        <p className="text-xs text-muted-foreground">
          To make this link resolve: set the SuiNS NameRecord user-data key{" "}
          <code>app:echo:form_id</code> to the Echo form&apos;s object id (
          <code>0x…</code>). This page reads it via the SuiNS testnet API and
          302-redirects to <code>/forms/[id]</code>.
        </p>
        <p className="text-xs text-muted-foreground">
          Manual override: <code>/s/{name}?to=0xYourFormId</code> bypasses the
          lookup.
        </p>
      </div>
    </section>
  );
}
