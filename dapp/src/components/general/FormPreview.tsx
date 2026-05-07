"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PrivacyTier,
  type FormMetadata,
  type FormSchema,
  type SubmissionAnswer,
} from "@/lib/echo/types";
import { FormFieldInput } from "./FormFieldInput";

const TIER_LABELS: Record<number, string> = {
  0: "Public",
  1: "Admin only",
  2: "Threshold reveal",
  3: "Time-locked",
  4: "Conditional",
};

/**
 * Interactive preview — fills are local-only and never reach Walrus or
 * the chain. Uses the same FormFieldInput as the live respondent flow,
 * so what you test here is what they'll get.
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
  const [answers, setAnswers] = useState<Record<string, SubmissionAnswer>>({});
  const setAnswer = (id: string, value: SubmissionAnswer) =>
    setAnswers((curr) => ({ ...curr, [id]: value }));

  // Apply showWhen visibility (mirrors FormViewer behavior).
  const visibleFields = schema.fields.filter((f) => {
    const conds = f.showWhen ?? [];
    if (conds.length === 0) return true;
    return conds.every((cond) => {
      const a = answers[cond.fieldId];
      if (!a) return false;
      const value =
        a.kind === "checkbox" ||
        a.kind === "rating" ||
        a.kind === "text" ||
        a.kind === "choice" ||
        a.kind === "date"
          ? (a.value as unknown)
          : null;
      if (cond.equals !== undefined) {
        if (Array.isArray(value)) return value.includes(String(cond.equals));
        return value === cond.equals;
      }
      if (cond.oneOf) {
        const set = new Set<string | number>(cond.oneOf);
        if (Array.isArray(value)) return value.some((v) => set.has(v));
        return set.has(value as string | number);
      }
      return true;
    });
  });

  const unanswered = schema.fields.filter((f) => f.required && !answers[f.id]);
  const filledCount = Object.keys(answers).length;

  return (
    <div className="border rounded p-4 bg-card flex flex-col gap-3 sticky top-md">
      <header className="flex flex-col gap-1">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Live preview · test answers stay local
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
        {visibleFields.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fields yet.</p>
        ) : (
          visibleFields.map((f) => (
            <FormFieldInput
              key={f.id}
              field={f}
              value={answers[f.id]}
              onChange={(v) => setAnswer(f.id, v)}
            />
          ))
        )}
      </div>

      <div className="flex items-center gap-2 mt-2">
        <button
          type="button"
          onClick={() => setAnswers({})}
          disabled={filledCount === 0}
          className={cn(
            "text-xs underline text-muted-foreground",
            filledCount === 0 && "opacity-40 cursor-not-allowed",
          )}
        >
          Reset
        </button>
        <span className="text-xs text-muted-foreground ml-auto">
          {filledCount}/{schema.fields.length} filled
          {unanswered.length > 0 && (
            <> · {unanswered.length} required missing</>
          )}
        </span>
      </div>

      <div className="border rounded px-3 py-2 text-xs bg-muted/50 text-muted-foreground">
        Answers shown here are <strong>local only</strong> — never sent to
        Walrus or the chain. Real respondents will see the same UI but their
        answers go through the sponsored submit flow.
      </div>
    </div>
  );
};
