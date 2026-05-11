"use client";

import { useState } from "react";
import {
  Upload,
  Image as ImageIcon,
  Video,
  FileIcon,
  Check,
} from "lucide-react";
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

// Shared input/textarea/select chrome — single source of truth so the
// focus ring, hover border, and rounded-lg shape stay consistent across
// every field type. Mirrors shadcn/ui's Input pattern.
const FIELD_CHROME =
  "w-full rounded-lg border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 outline-none transition-colors hover:border-foreground/40 focus-visible:border-foreground/60 focus-visible:ring-2 focus-visible:ring-foreground/10 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50";

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
  switch (field.type) {
    case "short_text":
    case "url":
      return (
        <Field label={field.label} required={field.required}>
          <input
            type="text"
            className={FIELD_CHROME}
            placeholder={field.placeholder}
            maxLength={field.maxLength}
            value={value?.kind === "text" ? value.value : ""}
            onChange={(e) => onChange({ kind: "text", value: e.target.value })}
          />
        </Field>
      );
    case "long_text":
      return (
        <Field label={field.label} required={field.required}>
          <textarea
            className={cn(FIELD_CHROME, "min-h-[120px] leading-relaxed py-3")}
            maxLength={"maxLength" in field ? field.maxLength : undefined}
            value={value?.kind === "text" ? value.value : ""}
            onChange={(e) => onChange({ kind: "text", value: e.target.value })}
          />
        </Field>
      );
    case "rich_text":
      return (
        <Field label={field.label} required={field.required}>
          <MarkdownEditor
            value={value?.kind === "text" ? value.value : ""}
            onChange={(next) => onChange({ kind: "text", value: next })}
          />
        </Field>
      );
    case "single_select":
    case "dropdown":
      return (
        <Field label={field.label} required={field.required}>
          <select
            className={cn(
              FIELD_CHROME,
              "appearance-none bg-[length:1rem] bg-no-repeat bg-[right_0.75rem_center] pr-9 cursor-pointer",
              "[background-image:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%226 9 12 15 18 9%22/></svg>')]",
            )}
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
        </Field>
      );
    case "multi_select": {
      const arr =
        value?.kind === "choice" && Array.isArray(value.value)
          ? value.value
          : [];
      return (
        <Field label={field.label} required={field.required}>
          <div className="flex flex-col gap-2">
            {field.options.map((o) => {
              const checked = arr.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    const next = checked
                      ? arr.filter((v) => v !== o.value)
                      : [...arr, o.value];
                    onChange({ kind: "choice", value: next });
                  }}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-all",
                    "hover:border-foreground/40 hover:bg-accent/40",
                    checked
                      ? "border-foreground/60 bg-accent/60"
                      : "border-border",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
                      checked
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background group-hover:border-foreground/40",
                    )}
                  >
                    {checked && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span>{o.label}</span>
                </button>
              );
            })}
          </div>
        </Field>
      );
    }
    case "checkbox": {
      const checked = value?.kind === "checkbox" ? value.value : false;
      return (
        <button
          type="button"
          onClick={() => onChange({ kind: "checkbox", value: !checked })}
          className={cn(
            "group flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-all",
            "hover:border-foreground/40 hover:bg-accent/40",
            checked ? "border-foreground/60 bg-accent/60" : "border-border",
          )}
        >
          <span
            className={cn(
              "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
              checked
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background group-hover:border-foreground/40",
            )}
          >
            {checked && <Check size={12} strokeWidth={3} />}
          </span>
          <span className="font-medium">
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </span>
        </button>
      );
    }
    case "rating": {
      const current = value?.kind === "rating" ? value.value : 0;
      // Compact tiles for ≤5 scale, slightly smaller + scrollable for ≥6.
      const tight = field.scale > 7;
      return (
        <Field label={field.label} required={field.required}>
          <div className={cn("flex flex-wrap gap-2", tight && "gap-1.5")}>
            {Array.from({ length: field.scale }, (_, i) => i + 1).map((n) => {
              const selected = current >= n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => onChange({ kind: "rating", value: n })}
                  className={cn(
                    "inline-flex shrink-0 items-center justify-center rounded-lg border font-semibold transition-all",
                    tight ? "h-10 w-10 text-sm" : "h-12 w-12 text-base",
                    "hover:border-foreground/50 hover:scale-105",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/10 focus-visible:ring-offset-2",
                    selected
                      ? "border-foreground bg-foreground text-background shadow-sm"
                      : "border-border bg-background text-muted-foreground",
                  )}
                  aria-pressed={current === n}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </Field>
      );
    }
    case "date":
    case "time":
      return (
        <Field label={field.label} required={field.required}>
          <input
            type={field.type}
            className={cn(FIELD_CHROME, "w-fit min-w-[200px]")}
            value={value?.kind === "date" ? value.value : ""}
            onChange={(e) => onChange({ kind: "date", value: e.target.value })}
          />
        </Field>
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

/** Shared label + required marker + slot. */
function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </span>
      {children}
    </label>
  );
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

  const upload = async (file: File) => {
    setError(null);
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
    <Field label={field.label} required={field.required}>
      {!blob && (
        <label
          className={cn(
            "flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors",
            uploading
              ? "opacity-60 cursor-wait border-border"
              : "border-border hover:border-foreground/40 hover:bg-accent/30",
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
          <Upload size={22} className="text-muted-foreground" />
          <span className="text-sm font-medium">
            {uploading
              ? `Uploading ${pendingName ?? "…"}`
              : `Click to upload ${field.type === "screenshot" ? "an image" : field.type === "video" ? "a video" : "a file"}`}
          </span>
          {accept && (
            <span className="text-xs text-muted-foreground">
              Accepts <code>{accept}</code>
            </span>
          )}
        </label>
      )}
      {blob && (
        <div className="rounded-lg border bg-card p-3 flex flex-col gap-2">
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
    </Field>
  );
}
