"use client";

import { cn } from "@/lib/utils";
import type { FormField, SubmissionAnswer } from "@/lib/echo/types";

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
    default:
      return (
        <p className="text-xs text-muted-foreground">
          Field type <code>{field.type}</code> not yet supported in this viewer.
        </p>
      );
  }
}
