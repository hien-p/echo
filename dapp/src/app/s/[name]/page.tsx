import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const runtime = "edge";

type Params = { name: string };

export const metadata: Metadata = {
  title: "Echo · SuiNS shareable link",
};

/**
 * SuiNS-branded shareable link. Visiting /s/feedback.firstmovers.sui resolves
 * the SuiNS name on chain and 302-redirects to /forms/[id]. The mapping is
 * stored in a dynamic_field on the SuiNS NameRecord under key
 * `app:echo:form_id`.
 *
 * Currently a stub that documents the intended resolver. Wiring requires:
 *   1. A `set_form_id_for_name(name_record: &mut NameRecord, form_id: ID)`
 *      Move helper, OR using SuiNS' built-in `set_user_data(key, value)`
 *      with key="app:echo:form_id"
 *   2. A JSON-RPC `getDynamicField` call here at request time to read it
 *   3. Redirect to the resolved form id
 */
export default async function SuiNSShareablePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { name } = await params;

  // TODO(suins): resolve `name` via SuiNS package + dynamic_field
  // const formId = await resolveSuinsToFormId(name);
  // if (formId) redirect(`/forms/${formId}`);

  return (
    <section className="flex flex-col gap-md max-w-[640px] mx-auto p-md w-full">
      <header>
        <h1 className="text-2xl font-semibold">SuiNS resolver</h1>
        <p className="text-sm text-muted-foreground">
          <code>{name}</code>
        </p>
      </header>
      <div className="border rounded p-3 bg-amber-50 dark:bg-amber-950/30 text-sm">
        <p className="text-amber-700 dark:text-amber-400">
          SuiNS resolver not yet active. To wire this:
        </p>
        <ol className="list-decimal list-inside mt-2 text-xs text-muted-foreground space-y-1">
          <li>
            On the SuiNS NameRecord for <code>{name}</code>, set user-data
            <code> app:echo:form_id = 0x…</code> (the Echo form id you want this
            link to point to).
          </li>
          <li>This route then resolves the name → form id at request time.</li>
          <li>
            Redirects to <code>/forms/[id]</code>.
          </li>
        </ol>
      </div>
    </section>
  );
}

// Helper to suppress unused import lint when redirect() is wired up.
void redirect;
