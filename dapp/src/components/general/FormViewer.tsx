"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { clientConfig } from "@/config/clientConfig";
import { cn } from "@/lib/utils";
import {
  buildSubmitAnonymousTx,
  buildSubmitTx,
  getWalrusClient,
  makeWalletSigner,
  readJsonBlob,
  uploadJsonBlob,
  type FormField,
  type FormMetadata,
  type FormSchema,
  type SubmissionAnswer,
  type SubmissionPayload,
} from "@/lib/echo";

interface OnChainForm {
  schema_blob_id: string;
  schema_version: string;
  metadata_blob_id: string;
  owner: string;
  privacy_tier: number;
  threshold_n: number;
  threshold_m: number;
  unlock_ms: string;
  conditional_policy_id: string;
  status: number;
  submission_count: string;
  created_ms: string;
}

const STATUS_LABELS: Record<number, string> = {
  1: "open",
  2: "closed",
  3: "archived",
};
const TIER_LABELS: Record<number, string> = {
  0: "Public",
  1: "Admin only",
  2: "Threshold reveal",
  3: "Time-locked",
  4: "Conditional",
};

export const FormViewer = ({ formId }: { formId: string }) => {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const suiClient = dAppKit.getClient();
  const packageId = clientConfig.ECHO_PACKAGE_ID;

  const formQuery = useQuery({
    queryKey: ["echo", "form", formId],
    queryFn: async () => {
      const resp = await suiClient.getObject({
        objectId: formId,
        include: { json: true },
      });
      const onChain = resp.object.json as OnChainForm | null;
      if (!onChain) throw new Error("Form has no JSON content; bad object id?");
      const walrus = getWalrusClient(suiClient, clientConfig.WALRUS_NETWORK);
      const [schema, metadata] = await Promise.all([
        readJsonBlob<FormSchema>(walrus, onChain.schema_blob_id),
        readJsonBlob<FormMetadata>(walrus, onChain.metadata_blob_id),
      ]);
      return { onChain, schema, metadata };
    },
    enabled: formId.startsWith("0x"),
    retry: 1,
  });

  if (formQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading form…</p>;
  }
  if (formQuery.error) {
    return (
      <p className="text-sm text-destructive">
        Failed to load: {(formQuery.error as Error).message}
      </p>
    );
  }
  if (!formQuery.data) return null;

  const { onChain, schema, metadata } = formQuery.data;
  const isOpen = onChain.status === 1;

  return (
    <div className="flex flex-col gap-md">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{metadata.title}</h1>
        {metadata.description && (
          <p className="text-sm text-muted-foreground">
            {metadata.description}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {TIER_LABELS[onChain.privacy_tier] ?? "?"} ·{" "}
          {STATUS_LABELS[onChain.status] ?? "?"}
          {" · "}
          {onChain.submission_count} submission(s)
        </p>
      </header>

      {!isOpen ? (
        <p className="text-sm text-amber-700">
          This form is not accepting submissions (
          {STATUS_LABELS[onChain.status] ?? "unknown"}).
        </p>
      ) : packageId !== onChain.schema_blob_id.split("::")[0] ? (
        <SubmitForm
          formId={formId}
          packageId={packageId}
          schema={schema}
          schemaVersion={Number(onChain.schema_version)}
          dAppKit={dAppKit}
          suiClient={suiClient}
          accountAddress={account?.address}
        />
      ) : null}
    </div>
  );
};

function SubmitForm({
  formId,
  packageId,
  schema,
  schemaVersion,
  dAppKit,
  suiClient,
  accountAddress,
}: {
  formId: string;
  packageId: string;
  schema: FormSchema;
  schemaVersion: number;
  dAppKit: ReturnType<typeof useDAppKit>;
  suiClient: ReturnType<ReturnType<typeof useDAppKit>["getClient"]>;
  accountAddress?: string;
}) {
  const [answers, setAnswers] = useState<Record<string, SubmissionAnswer>>({});
  const [anonymous, setAnonymous] = useState(false);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "submitting"; step: string }
    | { kind: "submitted"; digest: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const setAnswer = (id: string, value: SubmissionAnswer) =>
    setAnswers((curr) => ({ ...curr, [id]: value }));

  const validate = (): string | null => {
    for (const f of schema.fields) {
      if (!f.required) continue;
      const a = answers[f.id];
      if (!a) return `Field "${f.label}" is required.`;
      if (a.kind === "text" && !a.value.trim())
        return `Field "${f.label}" cannot be empty.`;
      if (
        a.kind === "choice" &&
        (!a.value || (Array.isArray(a.value) && a.value.length === 0))
      )
        return `Field "${f.label}" requires a selection.`;
      if (a.kind === "rating" && !a.value)
        return `Field "${f.label}" requires a rating.`;
    }
    return null;
  };

  const submit = async () => {
    setStatus({ kind: "idle" });
    if (!accountAddress) {
      setStatus({ kind: "error", message: "Connect a wallet first." });
      return;
    }
    const err = validate();
    if (err) {
      setStatus({ kind: "error", message: err });
      return;
    }
    try {
      const walrus = getWalrusClient(suiClient, clientConfig.WALRUS_NETWORK);
      const signer = makeWalletSigner(dAppKit, { address: accountAddress });

      const payload: SubmissionPayload = {
        schemaVersion,
        answers,
        submittedAt: new Date().toISOString(),
      };

      setStatus({ kind: "submitting", step: "Uploading payload to Walrus…" });
      const { blobId } = await uploadJsonBlob(walrus, signer, payload);

      setStatus({ kind: "submitting", step: "Submitting on chain…" });
      const tx = anonymous
        ? buildSubmitAnonymousTx({
            packageId,
            formId,
            payloadBlobId: blobId,
            commitment: cryptoRandomBytes(32),
          })
        : buildSubmitTx({
            packageId,
            formId,
            payloadBlobId: blobId,
          });

      const result = await dAppKit.signAndExecuteTransaction({
        transaction: tx,
      });
      if (result.$kind === "FailedTransaction") {
        setStatus({
          kind: "error",
          message: `Submission failed: ${result.FailedTransaction.digest}`,
        });
        return;
      }
      setStatus({ kind: "submitted", digest: result.Transaction.digest });
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <div className="flex flex-col gap-md">
      {schema.fields.map((field) => (
        <FieldInput
          key={field.id}
          field={field}
          value={answers[field.id]}
          onChange={(v) => setAnswer(field.id, v)}
        />
      ))}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={anonymous}
          onChange={(e) => setAnonymous(e.target.checked)}
        />
        Submit anonymously (the chain records a commitment hash, not your
        address)
      </label>

      <button
        type="button"
        onClick={() => void submit()}
        disabled={!accountAddress || status.kind === "submitting"}
        className={cn(
          "border rounded px-4 py-2 font-medium",
          accountAddress && status.kind !== "submitting"
            ? "bg-foreground text-background hover:opacity-90"
            : "opacity-60 cursor-not-allowed",
        )}
      >
        {status.kind === "submitting"
          ? status.step
          : accountAddress
            ? "Submit"
            : "Connect wallet to submit"}
      </button>

      {status.kind === "error" && (
        <p className="text-sm text-destructive">{status.message}</p>
      )}
      {status.kind === "submitted" && (
        <p className="text-sm text-emerald-700">
          ✓ Submitted. Tx digest: <code>{status.digest.slice(0, 12)}…</code>
        </p>
      )}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value?: SubmissionAnswer;
  onChange: (value: SubmissionAnswer) => void;
}) {
  const Label = (
    <span className="text-sm font-medium">
      {field.label}
      {field.required && <span className="text-destructive ml-1">*</span>}
    </span>
  );

  switch (field.type) {
    case "short_text":
    case "url":
      return (
        <label className="flex flex-col gap-1">
          {Label}
          <input
            type="text"
            className="border rounded px-2 py-1"
            placeholder={field.placeholder}
            maxLength={field.maxLength}
            value={value?.kind === "text" ? value.value : ""}
            onChange={(e) => onChange({ kind: "text", value: e.target.value })}
          />
        </label>
      );
    case "long_text":
    case "rich_text":
      return (
        <label className="flex flex-col gap-1">
          {Label}
          <textarea
            className="border rounded px-2 py-1 min-h-[80px]"
            maxLength={"maxLength" in field ? field.maxLength : undefined}
            value={value?.kind === "text" ? value.value : ""}
            onChange={(e) => onChange({ kind: "text", value: e.target.value })}
          />
        </label>
      );
    case "single_select":
    case "dropdown":
      return (
        <label className="flex flex-col gap-1">
          {Label}
          <select
            className="border rounded px-2 py-1 w-fit"
            value={
              value?.kind === "choice" && typeof value.value === "string"
                ? value.value
                : ""
            }
            onChange={(e) =>
              onChange({ kind: "choice", value: e.target.value })
            }
          >
            <option value="">— pick one —</option>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      );
    case "multi_select":
      return (
        <fieldset className="flex flex-col gap-1">
          {Label}
          {field.options.map((o) => {
            const arr =
              value?.kind === "choice" && Array.isArray(value.value)
                ? value.value
                : [];
            const checked = arr.includes(o.value);
            return (
              <label key={o.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...arr, o.value]
                      : arr.filter((v) => v !== o.value);
                    onChange({ kind: "choice", value: next });
                  }}
                />
                {o.label}
              </label>
            );
          })}
        </fieldset>
      );
    case "checkbox":
      return (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value?.kind === "checkbox" ? value.value : false}
            onChange={(e) =>
              onChange({ kind: "checkbox", value: e.target.checked })
            }
          />
          {field.label}
          {field.required && <span className="text-destructive">*</span>}
        </label>
      );
    case "rating": {
      const current = value?.kind === "rating" ? value.value : 0;
      return (
        <div className="flex flex-col gap-1">
          {Label}
          <div className="flex gap-1">
            {Array.from({ length: field.scale }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onChange({ kind: "rating", value: n })}
                className={cn(
                  "border rounded w-8 h-8 text-sm",
                  current >= n && "bg-foreground text-background",
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      );
    }
    case "date":
    case "time":
      return (
        <label className="flex flex-col gap-1">
          {Label}
          <input
            type={field.type}
            className="border rounded px-2 py-1 w-fit"
            value={value?.kind === "date" ? value.value : ""}
            onChange={(e) => onChange({ kind: "date", value: e.target.value })}
          />
        </label>
      );
    default:
      return (
        <p className="text-xs text-muted-foreground">
          Field type <code>{field.type}</code> not yet supported in this viewer.
        </p>
      );
  }
}

function cryptoRandomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  if (typeof crypto !== "undefined") crypto.getRandomValues(out);
  return out;
}
