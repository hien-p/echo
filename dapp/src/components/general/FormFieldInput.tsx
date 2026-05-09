"use client";

import { useState } from "react";
import { Upload, Image as ImageIcon, Video, FileIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadBytesViaPublisher } from "@/lib/echo/walrus";
import type { FormField, SubmissionAnswer } from "@/lib/echo/types";
import { MarkdownEditor } from "./MarkdownEditor";

const TESTNET_AGGREGATORS = [
  "https://aggregator.walrus-testnet.walrus.space",
  "https://wal-aggregator-testnet.staketab.org",
];
const MAINNET_AGGREGATORS = [
  "https://aggregator.walrus.atalma.io",
  "https://walrus-mainnet-aggregator.nodes.guru",
];

function aggregatorUrlFor(blobId: string): string {
  // Used for inline preview; we hit the public aggregator directly so the
  // browser can stream the image/video without going through our proxy.
  const base =
    process.env.NEXT_PUBLIC_WALRUS_NETWORK === "mainnet"
      ? MAINNET_AGGREGATORS[0]
      : TESTNET_AGGREGATORS[0];
  return `${base}/v1/blobs/${blobId}`;
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Shared interactive renderer for a single form field. Used by both the
 * respondent FormViewer (with sponsored on-chain submit) and the
 * builder-side FormPreview (local-only test answers).
 */
export function FormFieldInput({
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
    case "rich_text":
      return (
        <div className="flex flex-col gap-1">
          {Label}
          <MarkdownEditor
            value={value?.kind === "text" ? value.value : ""}
            onChange={(next) => onChange({ kind: "text", value: next })}
          />
        </div>
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
          <div className="flex gap-1 flex-wrap">
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
    case "file_upload":
    case "screenshot":
    case "video":
      return <UploadField field={field} value={value} onChange={onChange} />;
    default:
      return (
        <p className="text-xs text-muted-foreground">
          Field type <code>{field.type}</code> not yet supported in this viewer.
        </p>
      );
  }
}

/**
 * Walrus-backed file upload. Streams bytes through /api/walrus/upload
 * (publisher proxy — pays zero gas), stores the resulting blob id +
 * mime type + size as a "blob" SubmissionAnswer. Inline preview for
 * screenshots, native controls for video, generic file card otherwise.
 */
function UploadField({
  field,
  value,
  onChange,
}: {
  field: FormField & { type: "file_upload" | "screenshot" | "video" };
  value?: SubmissionAnswer;
  onChange: (value: SubmissionAnswer) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState<string | null>(null);

  const accept =
    "accept" in field && field.accept
      ? field.accept
      : field.type === "screenshot"
        ? "image/*"
        : field.type === "video"
          ? "video/*"
          : undefined;

  const maxBytes = "maxSizeBytes" in field ? field.maxSizeBytes : undefined;

  const upload = async (file: File) => {
    setError(null);
    if (maxBytes && file.size > maxBytes) {
      setError(
        `File too large (${humanSize(file.size)} > ${humanSize(maxBytes)}).`,
      );
      return;
    }
    setUploading(true);
    setPendingName(file.name);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await uploadBytesViaPublisher(bytes);
      onChange({
        kind: "blob",
        blobId: result.blobId,
        mimeType: file.type || undefined,
        bytes: file.size,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const blob = value?.kind === "blob" ? value : null;
  const Icon =
    field.type === "screenshot"
      ? ImageIcon
      : field.type === "video"
        ? Video
        : FileIcon;

  return (
    <div className="flex flex-col gap-2">
      {Label({ field })}
      {!blob && (
        <label
          className={cn(
            "border-2 border-dashed rounded p-4 flex flex-col items-center gap-2 cursor-pointer transition-colors",
            uploading
              ? "opacity-60 cursor-wait"
              : "border-border hover:border-foreground/40 hover:bg-accent/40",
          )}
        >
          <input
            type="file"
            accept={accept}
            disabled={uploading}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
          <Upload size={20} className="text-muted-foreground" />
          <span className="text-sm">
            {uploading
              ? `Uploading ${pendingName ?? "…"}`
              : `Click to upload ${field.type === "screenshot" ? "an image" : field.type === "video" ? "a video" : "a file"}`}
          </span>
          {accept && (
            <span className="text-xs text-muted-foreground">
              Accepts: <code>{accept}</code>
              {maxBytes && ` · max ${humanSize(maxBytes)}`}
            </span>
          )}
        </label>
      )}
      {blob && (
        <div className="border rounded p-3 flex flex-col gap-2 bg-card">
          <div className="flex items-center gap-2 text-sm">
            <Icon size={14} />
            <span className="truncate flex-1">
              <code className="text-xs">{blob.blobId.slice(0, 18)}…</code>
            </span>
            <span className="text-xs text-muted-foreground">
              {blob.mimeType ?? "?"}
              {blob.bytes ? ` · ${humanSize(blob.bytes)}` : ""}
            </span>
          </div>
          {field.type === "screenshot" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={aggregatorUrlFor(blob.blobId)}
              alt={field.label}
              className="max-h-48 rounded border"
            />
          )}
          {field.type === "video" && (
            <video
              src={aggregatorUrlFor(blob.blobId)}
              controls
              className="max-h-48 rounded border"
            />
          )}
          <button
            type="button"
            onClick={() =>
              onChange({
                kind: "blob",
                blobId: "",
                mimeType: undefined,
                bytes: 0,
              })
            }
            className="text-xs text-muted-foreground underline w-fit hover:text-foreground"
          >
            Replace…
          </button>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Label({ field }: { field: FormField }) {
  return (
    <span className="text-sm font-medium">
      {field.label}
      {field.required && <span className="text-destructive ml-1">*</span>}
    </span>
  );
}
