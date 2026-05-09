"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { Database, Sparkles } from "lucide-react";
import { apiUrl, clientConfig } from "@/config/clientConfig";
import { cn } from "@/lib/utils";
import { readJsonViaAggregator, type FormMetadata } from "@/lib/echo";
import { useDemoAdminMode } from "./DemoAdminToggle";

interface OnChainForm {
  metadata_blob_id: string;
  privacy_tier: number;
}

interface OwnedCap {
  objectId: string;
  json: { form_id: string };
}

interface FormChoice {
  id: string;
  title: string;
  privacyTier: number;
}

export const InsightsConsole = () => {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const suiClient = dAppKit.getClient();
  const packageId = clientConfig.ECHO_PACKAGE_ID;
  const demoMode = useDemoAdminMode();
  const demoAddress = clientConfig.DEMO_ADMIN_ADDRESS;
  const ownerAddress = demoMode ? demoAddress : account?.address;

  const [selectedFormId, setSelectedFormId] = useState("");
  const [question, setQuestion] = useState("");
  // Track which form ids we've already auto-indexed in this tab session
  // so re-selecting a form doesn't re-trigger the API call. Manual
  // "re-index" link bypasses this when the user wants fresh data.
  const autoIndexed = useRef<Set<string>>(new Set());

  const formsQuery = useQuery({
    queryKey: ["echo", "insights", "forms", ownerAddress, demoMode],
    queryFn: async (): Promise<FormChoice[]> => {
      if (!ownerAddress) return [];
      const owned = await suiClient.listOwnedObjects({
        owner: ownerAddress,
        type: `${packageId}::form::FormOwnerCap`,
        include: { json: true },
        limit: 100,
      });
      const caps = owned.objects as unknown as OwnedCap[];
      const ids = caps
        .map((c) => c.json?.form_id)
        .filter((x): x is string => !!x);
      if (ids.length === 0) return [];
      const formObjs = await suiClient.getObjects({
        objectIds: ids,
        include: { json: true },
      });
      const network = clientConfig.WALRUS_NETWORK;
      return Promise.all(
        formObjs.objects.map(async (obj) => {
          const fobj = obj as unknown as {
            objectId: string;
            json: OnChainForm;
          };
          let title = "(metadata unavailable)";
          try {
            const meta = await readJsonViaAggregator<FormMetadata>(
              fobj.json.metadata_blob_id,
              { network },
            );
            title = meta.title;
          } catch {
            /* keep fallback */
          }
          return {
            id: fobj.objectId,
            title,
            privacyTier: fobj.json.privacy_tier,
          };
        }),
      );
    },
    enabled: !!ownerAddress && packageId.startsWith("0x"),
  });

  const indexMutation = useMutation({
    mutationFn: async (formId: string) => {
      const resp = await fetch(apiUrl("/api/insights/index_form"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ formId }),
      });
      const data = (await resp.json()) as {
        indexed?: number;
        skipped?: number;
        deduped?: number;
        namespace?: string;
        errors?: string[];
        error?: string;
      };
      if (!resp.ok) throw new Error(data.error ?? `HTTP ${resp.status}`);
      return data;
    },
  });

  // Auto-index when the user picks a form. Run-once-per-session per id —
  // re-selecting the same form skips the API call. The "re-index" link
  // surfaced under the selector lets the user force a refresh when new
  // submissions land. Without this, the manual "Index" button was just
  // an extra step between Select and Ask that judges had to discover.
  useEffect(() => {
    if (!selectedFormId) return;
    if (autoIndexed.current.has(selectedFormId)) return;
    autoIndexed.current.add(selectedFormId);
    indexMutation.mutate(selectedFormId);
    // indexMutation is referentially stable from useMutation; only
    // selectedFormId actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFormId]);

  // Track deduped count too so the status line can mention it.
  // (Already in indexMutation.data via the API response shape.)

  const queryMutation = useMutation({
    mutationFn: async ({
      formId,
      question,
    }: {
      formId: string;
      question: string;
    }) => {
      const resp = await fetch(apiUrl("/api/insights/query"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ formId, question }),
      });
      const data = (await resp.json()) as {
        answer?: string;
        namespace?: string;
        error?: string;
      };
      if (!resp.ok) throw new Error(data.error ?? `HTTP ${resp.status}`);
      return data;
    },
  });

  if (!ownerAddress) {
    return (
      <p className="text-sm text-muted-foreground">
        Connect a wallet to see your forms.
      </p>
    );
  }
  const forms = formsQuery.data ?? [];
  const selected = forms.find((f) => f.id === selectedFormId);

  return (
    <div className="flex flex-col gap-md">
      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium">Form</label>
        <select
          className="border rounded px-2 py-1"
          value={selectedFormId}
          onChange={(e) => setSelectedFormId(e.target.value)}
        >
          <option value="">— select a form —</option>
          {forms.map((f) => {
            const isPublic = f.privacyTier === 0;
            const isTimeLocked = f.privacyTier === 3;
            // In demo mode, the server uses DEMO_ADMIN_SECRET_KEY to sign the
            // SessionKey and looks up the FormOwnerCap on the demo address —
            // so AdminOnly/Threshold/Conditional are also indexable.
            const indexableServerSide = isPublic || isTimeLocked || demoMode;
            const tag = isPublic
              ? ""
              : isTimeLocked
                ? "(time-locked · indexable post-unlock)"
                : demoMode
                  ? "(encrypted · demo-key indexable)"
                  : "(admin-only · use browser indexer)";
            return (
              <option
                key={f.id}
                value={f.id}
                disabled={!indexableServerSide}
                title={
                  isPublic
                    ? "Public — server can index plaintext directly."
                    : isTimeLocked
                      ? "Time-locked — server auto-decrypts after unlock_ms via permissionless Seal policy."
                      : demoMode
                        ? "Demo mode — server uses DEMO_ADMIN_SECRET_KEY to sign the SessionKey and decrypt as the form owner."
                        : "AdminOnly / Threshold / Conditional — needs browser-side indexer (admin signs SessionKey, decrypts locally, sends only embeddings)."
                }
              >
                {f.title} {tag}
              </option>
            );
          })}
        </select>
        {selected && (
          <div className="flex gap-2 items-center text-xs flex-wrap">
            {indexMutation.isPending ? (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Database size={12} className="animate-pulse" /> Indexing
                submissions into Memwal…
              </span>
            ) : indexMutation.data ? (
              <>
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <Database size={12} /> Ready · {indexMutation.data.indexed}{" "}
                  submission
                  {indexMutation.data.indexed === 1 ? "" : "s"} indexed
                  {indexMutation.data.deduped
                    ? ` · ${indexMutation.data.deduped} deduped`
                    : ""}
                </span>
                <button
                  type="button"
                  onClick={() => indexMutation.mutate(selected.id)}
                  className="text-muted-foreground underline hover:text-foreground"
                  title="Re-index to pick up new submissions since last index"
                >
                  re-index
                </button>
                <span className="text-muted-foreground">
                  · namespace <code>{indexMutation.data.namespace}</code>
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                Preparing the form for queries…
              </span>
            )}
            {indexMutation.error instanceof Error && (
              <span className="text-destructive">
                {indexMutation.error.message}
              </span>
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium">Ask</label>
        <textarea
          className="border rounded px-2 py-1 min-h-[80px]"
          placeholder="What are users saying about gas fees this month?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        {/* Sample-question chips. Click to populate the textarea so first-
            time users have a starting point that actually returns matches
            against the current namespace. */}
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="text-muted-foreground self-center mr-1">try:</span>
          {[
            "What did people say worked well?",
            "Where did Echo feel rough or confusing?",
            "Would respondents use Echo for a real form?",
            "Summarize the most common feedback themes.",
          ].map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setQuestion(q)}
              className="border rounded-full px-2 py-0.5 hover:bg-accent text-muted-foreground hover:text-foreground"
            >
              {q}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            queryMutation.mutate({ formId: selectedFormId, question })
          }
          disabled={
            !selectedFormId || !question.trim() || queryMutation.isPending
          }
          className={cn(
            "border rounded px-4 py-2 font-medium w-fit flex items-center gap-1",
            !selectedFormId || !question.trim() || queryMutation.isPending
              ? "opacity-60 cursor-not-allowed"
              : "bg-foreground text-background hover:opacity-90",
          )}
        >
          <Sparkles size={14} />
          {queryMutation.isPending ? "Thinking…" : "Ask"}
        </button>
        {queryMutation.error instanceof Error && (
          <p className="text-sm text-destructive">
            {queryMutation.error.message}
          </p>
        )}
        {queryMutation.data?.answer && (
          <article className="border rounded p-3 bg-card text-sm whitespace-pre-wrap">
            {queryMutation.data.answer}
          </article>
        )}
      </section>

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">How this works</summary>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>
            <strong>Index this form</strong> calls{" "}
            <code>/api/insights/index_form</code> which reads SubmissionMade
            events for the form, downloads each public Walrus payload, flattens
            answers to text, and stores them in a per-form Memwal namespace via{" "}
            <code>memwal.remember()</code>.
          </li>
          <li>
            <strong>Ask</strong> calls <code>/api/insights/query</code>: wraps
            an OpenRouter model with <code>withMemWal</code>, which auto-injects
            relevant memories before sending to the LLM.
          </li>
          <li>
            Encrypted tiers (Admin only / Threshold / TimeLocked / Conditional)
            can&apos;t be indexed — server doesn&apos;t hold a session-key
            delegation. They&apos;d need a separate flow where the admin runs
            the indexer locally with their decryption.
          </li>
        </ul>
      </details>
    </div>
  );
};
