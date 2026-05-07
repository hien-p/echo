"use client";

import { Lock } from "lucide-react";
import {
  PrivacyTier,
  type FormField,
  type FormMetadata,
  type FormSchema,
} from "@/lib/echo/types";

const TIER_LABELS: Record<number, string> = {
  0: "Public",
  1: "Admin only",
  2: "Threshold reveal",
  3: "Time-locked",
  4: "Conditional",
};

/**
 * Read-only render of a form schema — exactly what respondents will see.
 * Inputs are disabled so the preview doesn't fight the builder for focus.
 */
export const FormPreview = ({
  schema,
  metadata,
  privacyTier,
}: {
  schema: FormSchema;
  metadata: FormMetadata;
  privacyTier: PrivacyTier;
}) => {
  return (
    <div className="border rounded p-4 bg-card flex flex-col gap-3 sticky top-md">
      <header className="flex flex-col gap-1">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Preview · what respondents see
        </p>
        <h2 className="text-xl font-semibold">
          {metadata.title || "(no title)"}
        </h2>
        {metadata.description && (
          <p className="text-sm text-muted-foreground">
            {metadata.description}
          </p>
        )}
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
          {privacyTier !== PrivacyTier.Public && <Lock size={11} />}
          {TIER_LABELS[privacyTier] ?? "?"}
        </p>
      </header>

      <div className="flex flex-col gap-3">
        {schema.fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fields yet.</p>
        ) : (
          schema.fields.map((f) => <PreviewField key={f.id} field={f} />)
        )}
      </div>

      <button
        type="button"
        disabled
        className="border rounded px-4 py-2 font-medium bg-foreground text-background opacity-60 cursor-not-allowed mt-2"
      >
        Submit
      </button>
    </div>
  );
};

function PreviewField({ field }: { field: FormField }) {
  const Label = (
    <span className="text-sm font-medium">
      {field.label}
      {field.required && <span className="text-destructive ml-1">*</span>}
    </span>
  );
  const baseInput =
    "border rounded px-2 py-1 bg-background opacity-70 cursor-not-allowed";

  switch (field.type) {
    case "short_text":
    case "url":
      return (
        <label className="flex flex-col gap-1">
          {Label}
          <input
            type="text"
            disabled
            placeholder={field.type === "url" ? "https://…" : field.placeholder}
            className={baseInput}
          />
        </label>
      );
    case "long_text":
    case "rich_text":
      return (
        <label className="flex flex-col gap-1">
          {Label}
          <textarea disabled className={`${baseInput} min-h-[60px]`} />
        </label>
      );
    case "single_select":
    case "dropdown":
      return (
        <label className="flex flex-col gap-1">
          {Label}
          <select disabled className={`${baseInput} w-fit`}>
            <option>— pick one —</option>
            {field.options.map((o) => (
              <option key={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      );
    case "multi_select":
      return (
        <fieldset className="flex flex-col gap-1">
          {Label}
          {field.options.map((o) => (
            <label
              key={o.value}
              className="flex items-center gap-2 text-sm opacity-70"
            >
              <input type="checkbox" disabled />
              {o.label}
            </label>
          ))}
        </fieldset>
      );
    case "checkbox":
      return (
        <label className="flex items-center gap-2 text-sm opacity-70">
          <input type="checkbox" disabled />
          {field.label}
          {field.required && <span className="text-destructive">*</span>}
        </label>
      );
    case "rating":
      return (
        <div className="flex flex-col gap-1">
          {Label}
          <div className="flex gap-1">
            {Array.from({ length: field.scale }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                disabled
                className="border rounded w-7 h-7 text-xs opacity-60"
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      );
    case "date":
    case "time":
      return (
        <label className="flex flex-col gap-1">
          {Label}
          <input type={field.type} disabled className={`${baseInput} w-fit`} />
        </label>
      );
    case "file_upload":
    case "screenshot":
    case "video":
      return (
        <div className="flex flex-col gap-1">
          {Label}
          <div className={`${baseInput} text-xs text-muted-foreground`}>
            📎 file upload (max{" "}
            {field.maxSizeBytes
              ? `${(field.maxSizeBytes / (1024 * 1024)).toFixed(0)}MB`
              : "unlimited"}
            )
          </div>
        </div>
      );
    case "signature":
      return (
        <div className="flex flex-col gap-1">
          {Label}
          <div className={`${baseInput} h-20 text-xs text-muted-foreground`}>
            signature pad
          </div>
        </div>
      );
    default:
      return null;
  }
}
