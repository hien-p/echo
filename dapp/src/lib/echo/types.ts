/**
 * Echo SDK — shared types for forms, fields, submissions, and privacy tiers.
 * Mirrors the on-chain Move structs in `move/echo/sources/`.
 */

/** Match the Move u8 codes in `echo::form`. */
export const PrivacyTier = {
  Public: 0,
  AdminOnly: 1,
  Threshold: 2,
  TimeLocked: 3,
  Conditional: 4,
} as const;
export type PrivacyTier = (typeof PrivacyTier)[keyof typeof PrivacyTier];

export const FormStatus = {
  Open: 1,
  Closed: 2,
  Archived: 3,
} as const;
export type FormStatus = (typeof FormStatus)[keyof typeof FormStatus];

export type FieldType =
  | "short_text"
  | "long_text"
  | "rich_text"
  | "single_select"
  | "multi_select"
  | "dropdown"
  | "checkbox"
  | "rating"
  | "file_upload"
  | "screenshot"
  | "video"
  | "url"
  | "date"
  | "time"
  | "signature";

export interface BaseField {
  id: string;
  type: FieldType;
  label: string;
  description?: string;
  required?: boolean;
  /** Conditional logic: show this field only when these prior answers match. */
  showWhen?: ShowCondition[];
}

export interface ShowCondition {
  fieldId: string;
  equals?: string | number | boolean;
  oneOf?: (string | number)[];
}

export interface TextField extends BaseField {
  type: "short_text" | "long_text" | "url";
  maxLength?: number;
  placeholder?: string;
}

export interface RichTextField extends BaseField {
  type: "rich_text";
  maxLength?: number;
}

export interface ChoiceField extends BaseField {
  type: "single_select" | "multi_select" | "dropdown";
  options: { value: string; label: string }[];
}

export interface CheckboxField extends BaseField {
  type: "checkbox";
}

export interface RatingField extends BaseField {
  type: "rating";
  scale: number;
}

export interface UploadField extends BaseField {
  type: "file_upload" | "screenshot" | "video";
  /** Max bytes per upload. */
  maxSizeBytes?: number;
  /** Comma-separated MIME types or extensions. */
  accept?: string;
}

export interface DateField extends BaseField {
  type: "date" | "time";
}

export interface SignatureField extends BaseField {
  type: "signature";
}

export type FormField =
  | TextField
  | RichTextField
  | ChoiceField
  | CheckboxField
  | RatingField
  | UploadField
  | DateField
  | SignatureField;

/** Persisted to Walrus as JSON; the on-chain Form holds its blob ID. */
export interface FormSchema {
  version: 1;
  fields: FormField[];
  /** Optional gating predicate evaluated client-side before submit. */
  gating?: {
    type: "token" | "nft" | "suins";
    /** Move type for token/NFT, e.g. `0x2::sui::SUI`. SuiNS uses `domain` instead. */
    coinType?: string;
    nftType?: string;
    domain?: string;
    minAmount?: string;
  };
}

/** Persisted to Walrus alongside the schema; lighter and editable independently. */
export interface FormMetadata {
  title: string;
  description?: string;
  /** Branding color (hex). */
  accentColor?: string;
  /** Optional cover image as a Walrus blob ID. */
  coverBlobId?: string;
}

/** Persisted as the Walrus payload of a SubmissionRef. */
export interface SubmissionPayload {
  schemaVersion: number;
  /** Field id → answer value. Files are nested Walrus blob IDs. */
  answers: Record<string, SubmissionAnswer>;
  submittedAt: string;
}

export type SubmissionAnswer =
  | { kind: "text"; value: string }
  | { kind: "choice"; value: string | string[] }
  | { kind: "rating"; value: number }
  | { kind: "checkbox"; value: boolean }
  | { kind: "date"; value: string }
  | { kind: "blob"; blobId: string; mimeType?: string; bytes?: number };

/** Output of a Walrus blob write. */
export interface UploadResult {
  blobId: string;
  blobObjectId: string;
}
