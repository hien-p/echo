"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { clientConfig } from "@/config/clientConfig";
import { cn } from "@/lib/utils";
import {
  PrivacyTier,
  type FieldType,
  type FormField,
  type FormMetadata,
  type FormSchema,
} from "@/lib/echo/types";
import { buildCreateFormTx } from "@/lib/echo/tx";
import { getWalrusClient, uploadJsonBlob } from "@/lib/echo/walrus";
import { makeWalletSigner } from "@/lib/echo/walletSigner";

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "short_text", label: "Short text" },
  { value: "long_text", label: "Long text" },
  { value: "rich_text", label: "Rich text" },
  { value: "single_select", label: "Single select" },
  { value: "multi_select", label: "Multi select" },
  { value: "dropdown", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
  { value: "rating", label: "Star rating" },
  { value: "file_upload", label: "File upload" },
  { value: "screenshot", label: "Screenshot" },
  { value: "video", label: "Video" },
  { value: "url", label: "URL" },
  { value: "date", label: "Date" },
  { value: "time", label: "Time" },
  { value: "signature", label: "Signature" },
];

const TIER_OPTIONS: { value: PrivacyTier; label: string; help: string }[] = [
  {
    value: PrivacyTier.Public,
    label: "Public",
    help: "Open submissions, plaintext on Walrus, indexed and searchable.",
  },
  {
    value: PrivacyTier.AdminOnly,
    label: "Admin only",
    help: "Seal IBE — only the form owner can decrypt.",
  },
  {
    value: PrivacyTier.Threshold,
    label: "Threshold reveal",
    help: "N-of-M admin shares required to decrypt.",
  },
  {
    value: PrivacyTier.TimeLocked,
    label: "Time-locked",
    help: "Auto-decrypts after the configured timestamp.",
  },
  {
    value: PrivacyTier.Conditional,
    label: "Conditional",
    help: "Decrypts when an on-chain policy is satisfied.",
  },
];

let fieldCounter = 0;
const newFieldId = () => `f${++fieldCounter}_${Date.now().toString(36)}`;

interface Template {
  id: string;
  label: string;
  title: string;
  description: string;
  tier: PrivacyTier;
  fields: Omit<FormField, "id">[];
}

const TEMPLATES: Template[] = [
  {
    id: "blank",
    label: "— blank —",
    title: "Quick feedback",
    description: "Tell us what you think.",
    tier: PrivacyTier.Public,
    fields: [{ type: "long_text", label: "Your feedback", required: true }],
  },
  {
    id: "bug",
    label: "Bug report",
    title: "Bug report",
    description:
      "Found something broken? Help us reproduce and fix it. Steps + screenshots welcome.",
    tier: PrivacyTier.Public,
    fields: [
      { type: "short_text", label: "What broke?", required: true },
      {
        type: "long_text",
        label: "Steps to reproduce",
        required: true,
      },
      { type: "long_text", label: "What did you expect to happen?" },
      {
        type: "single_select",
        label: "Severity",
        required: true,
        options: [
          { value: "low", label: "Low — annoyance" },
          { value: "med", label: "Medium — workaround exists" },
          { value: "high", label: "High — blocks my work" },
          { value: "crit", label: "Critical — data loss / security" },
        ],
      } as Omit<FormField, "id">,
      { type: "url", label: "Link to screenshot or recording" },
    ],
  },
  {
    id: "feature",
    label: "Feature request",
    title: "Feature request",
    description:
      "What would make Echo better? One idea per submission. Anonymous OK.",
    tier: PrivacyTier.Public,
    fields: [
      { type: "short_text", label: "One-line summary", required: true },
      {
        type: "long_text",
        label: "What problem does this solve for you?",
        required: true,
      },
      {
        type: "rating",
        label: "How much would you use it? (1=rarely, 5=daily)",
        scale: 5,
      } as Omit<FormField, "id">,
    ],
  },
  {
    id: "nps",
    label: "NPS survey",
    title: "How likely are you to recommend us?",
    description: "Two questions, ~30 seconds.",
    tier: PrivacyTier.Public,
    fields: [
      {
        type: "rating",
        label: "0 = never, 10 = absolutely",
        scale: 10,
        required: true,
      } as Omit<FormField, "id">,
      { type: "long_text", label: "What's the biggest reason for that score?" },
    ],
  },
  {
    id: "grant",
    label: "Grant application (private)",
    title: "Grant application",
    description:
      "Tell us about your project. Submissions are encrypted — only the review committee can decrypt after the deadline.",
    tier: PrivacyTier.Threshold,
    fields: [
      { type: "short_text", label: "Project name", required: true },
      { type: "url", label: "Project link" },
      {
        type: "long_text",
        label: "What are you building? (max 500 words)",
        required: true,
        maxLength: 3000,
      } as Omit<FormField, "id">,
      {
        type: "long_text",
        label: "Why does it need a grant?",
        required: true,
      },
      {
        type: "short_text",
        label: "Requested amount (in USD or SUI)",
        required: true,
      },
    ],
  },
];

const defaultField = (type: FieldType): FormField => {
  const base = {
    id: newFieldId(),
    label: "Untitled question",
    required: false,
  };
  switch (type) {
    case "single_select":
    case "multi_select":
    case "dropdown":
      return {
        ...base,
        type,
        options: [
          { value: "opt1", label: "Option 1" },
          { value: "opt2", label: "Option 2" },
        ],
      };
    case "rating":
      return { ...base, type, scale: 5 };
    case "file_upload":
    case "screenshot":
    case "video":
      return { ...base, type, maxSizeBytes: 10 * 1024 * 1024 };
    default:
      return { ...base, type } as FormField;
  }
};

export const FormBuilder = () => {
  const currentAccount = useCurrentAccount();
  const dAppKit = useDAppKit();
  const router = useRouter();

  const blank = TEMPLATES[0];
  const [title, setTitle] = useState(blank.title);
  const [description, setDescription] = useState(blank.description);
  const [tier, setTier] = useState<PrivacyTier>(blank.tier);
  const [thresholdN, setThresholdN] = useState(2);
  const [thresholdM, setThresholdM] = useState(3);
  const [unlockMs, setUnlockMs] = useState("");
  const [policyId, setPolicyId] = useState("");
  const [fields, setFields] = useState<FormField[]>(
    blank.fields.map((f) => ({ ...f, id: newFieldId() }) as FormField),
  );
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "saving"; step: string }
    | { kind: "saved"; formId: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const packageId = clientConfig.ECHO_PACKAGE_ID;
  const packageDeployed = packageId.length > 0 && packageId.startsWith("0x");

  const schema = useMemo<FormSchema>(() => ({ version: 1, fields }), [fields]);
  const metadata = useMemo<FormMetadata>(
    () => ({ title, description: description || undefined }),
    [title, description],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const addField = (type: FieldType) =>
    setFields((curr) => [...curr, defaultField(type)]);
  const removeField = (id: string) =>
    setFields((curr) => curr.filter((f) => f.id !== id));
  const updateField = (id: string, patch: Partial<FormField>) =>
    setFields((curr) =>
      curr.map((f) => (f.id === id ? ({ ...f, ...patch } as FormField) : f)),
    );
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setFields((curr) => {
      const oldIndex = curr.findIndex((f) => f.id === active.id);
      const newIndex = curr.findIndex((f) => f.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return curr;
      return arrayMove(curr, oldIndex, newIndex);
    });
  };

  const handleSave = async () => {
    setStatus({ kind: "idle" });
    if (!currentAccount) {
      setStatus({ kind: "error", message: "Connect a wallet first." });
      return;
    }
    if (!packageDeployed) {
      setStatus({
        kind: "error",
        message:
          "Echo package not deployed. Set NEXT_PUBLIC_ECHO_PACKAGE_ID after running publish/.",
      });
      return;
    }

    try {
      const suiClient = dAppKit.getClient();
      const walrus = getWalrusClient(suiClient, clientConfig.WALRUS_NETWORK);
      const signer = makeWalletSigner(dAppKit, currentAccount);

      setStatus({ kind: "saving", step: "Uploading schema to Walrus…" });
      const { blobId: schemaBlobId } = await uploadJsonBlob(
        walrus,
        signer,
        schema,
      );

      setStatus({ kind: "saving", step: "Uploading metadata to Walrus…" });
      const { blobId: metadataBlobId } = await uploadJsonBlob(
        walrus,
        signer,
        metadata,
      );

      setStatus({ kind: "saving", step: "Creating form on chain…" });
      const tx = buildCreateFormTx({
        packageId,
        senderAddress: currentAccount.address,
        schemaBlobId,
        metadataBlobId,
        privacyTier: tier,
        thresholdN: tier === PrivacyTier.Threshold ? thresholdN : 0,
        thresholdM: tier === PrivacyTier.Threshold ? thresholdM : 0,
        unlockMs:
          tier === PrivacyTier.TimeLocked && unlockMs
            ? BigInt(unlockMs)
            : undefined,
        conditionalPolicyId:
          tier === PrivacyTier.Conditional ? policyId : undefined,
      });

      const result = await dAppKit.signAndExecuteTransaction({
        transaction: tx,
      });

      if (result.$kind === "FailedTransaction") {
        setStatus({
          kind: "error",
          message: `Transaction failed: ${result.FailedTransaction.digest}`,
        });
        return;
      }

      // Form is the only shared object created in this tx; FormOwnerCap is
      // address-owned. Filter changedObjects to find the Created+Shared one.
      const created = result.Transaction.effects?.changedObjects ?? [];
      const formChange = created.find(
        (c) => c.idOperation === "Created" && c.outputOwner?.$kind === "Shared",
      );
      const formId = formChange?.objectId ?? "";
      if (!formId) {
        setStatus({
          kind: "error",
          message: `Form created but couldn't find shared object id. Tx digest: ${result.Transaction.digest}`,
        });
        return;
      }

      setStatus({ kind: "saved", formId });
      router.push(`/forms/${formId}`);
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const applyTemplate = (templateId: string) => {
    const t = TEMPLATES.find((x) => x.id === templateId);
    if (!t) return;
    setTitle(t.title);
    setDescription(t.description);
    setTier(t.tier);
    setFields(t.fields.map((f) => ({ ...f, id: newFieldId() }) as FormField));
    setStatus({ kind: "idle" });
  };

  return (
    <div className="flex flex-col gap-md">
      <BuilderSection title="Start from a template">
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => applyTemplate(t.id)}
              className="border rounded px-3 py-1 text-sm hover:bg-accent"
            >
              {t.label}
            </button>
          ))}
        </div>
      </BuilderSection>

      <BuilderSection title="Metadata">
        <Field label="Title">
          <input
            className="w-full border rounded px-2 py-1"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Description">
          <textarea
            className="w-full border rounded px-2 py-1 min-h-[60px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
      </BuilderSection>

      <BuilderSection title="Privacy tier">
        <select
          className="border rounded px-2 py-1 w-fit"
          value={tier}
          onChange={(e) => setTier(Number(e.target.value) as PrivacyTier)}
        >
          {TIER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="text-sm text-muted-foreground">
          {TIER_OPTIONS.find((o) => o.value === tier)?.help}
        </p>
        {tier === PrivacyTier.Threshold && (
          <div className="flex gap-2 items-center">
            <Field label="N (required)">
              <input
                type="number"
                min={1}
                max={thresholdM}
                className="border rounded px-2 py-1 w-20"
                value={thresholdN}
                onChange={(e) => setThresholdN(Number(e.target.value))}
              />
            </Field>
            <Field label="M (total)">
              <input
                type="number"
                min={thresholdN}
                className="border rounded px-2 py-1 w-20"
                value={thresholdM}
                onChange={(e) => setThresholdM(Number(e.target.value))}
              />
            </Field>
          </div>
        )}
        {tier === PrivacyTier.TimeLocked && (
          <Field label="Unlock at (unix ms)">
            <input
              className="border rounded px-2 py-1 w-full"
              placeholder="1746000000000"
              value={unlockMs}
              onChange={(e) => setUnlockMs(e.target.value)}
            />
          </Field>
        )}
        {tier === PrivacyTier.Conditional && (
          <Field label="Policy ID">
            <input
              className="border rounded px-2 py-1 w-full"
              placeholder="airdrop_holder_v1"
              value={policyId}
              onChange={(e) => setPolicyId(e.target.value)}
            />
          </Field>
        )}
      </BuilderSection>

      <BuilderSection title="Fields">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={fields.map((f) => f.id)}
            strategy={verticalListSortingStrategy}
          >
            <ol className="flex flex-col gap-2">
              {fields.map((f) => (
                <SortableFieldRow
                  key={f.id}
                  field={f}
                  onUpdate={updateField}
                  onRemove={removeField}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
        <div className="flex gap-2 items-center">
          <select
            className="border rounded px-2 py-1 text-sm"
            id="add-field-type"
            defaultValue="short_text"
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            className="border rounded px-3 py-1 text-sm flex items-center gap-1 hover:bg-accent"
            onClick={() => {
              const sel = document.getElementById(
                "add-field-type",
              ) as HTMLSelectElement | null;
              if (sel) addField(sel.value as FieldType);
            }}
            type="button"
          >
            <Plus size={14} />
            Add field
          </button>
        </div>
      </BuilderSection>

      <div className="flex flex-col gap-2">
        <button
          className={cn(
            "border rounded px-4 py-2 font-medium",
            currentAccount && status.kind !== "saving"
              ? "bg-foreground text-background hover:opacity-90"
              : "opacity-60 cursor-not-allowed",
          )}
          onClick={() => void handleSave()}
          type="button"
          disabled={!currentAccount || status.kind === "saving"}
        >
          {status.kind === "saving"
            ? status.step
            : currentAccount
              ? "Save form"
              : "Connect wallet to save"}
        </button>
        {!packageDeployed && (
          <p className="text-xs text-amber-600">
            ⚠ NEXT_PUBLIC_ECHO_PACKAGE_ID is not set yet. Deploy the Move
            package via <code>publish/</code> and add the resulting object ID to{" "}
            <code>dapp/.env</code> to enable on-chain saves.
          </p>
        )}
        {status.kind === "error" && (
          <p className="text-sm text-destructive">{status.message}</p>
        )}
        {status.kind === "saved" && (
          <p className="text-sm text-emerald-700">
            ✓ Form created. Redirecting to{" "}
            <code>/forms/{status.formId.slice(0, 10)}…</code>
          </p>
        )}
      </div>
    </div>
  );
};

const BuilderSection = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="flex flex-col gap-2">
    <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
      {title}
    </h2>
    <div className="flex flex-col gap-2">{children}</div>
  </section>
);

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <label className="flex flex-col gap-1 text-sm">
    <span className="text-muted-foreground text-xs">{label}</span>
    {children}
  </label>
);

const SortableFieldRow = ({
  field,
  onUpdate,
  onRemove,
}: {
  field: FormField;
  onUpdate: (id: string, patch: Partial<FormField>) => void;
  onRemove: (id: string) => void;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="border rounded p-2 flex flex-col gap-2 bg-card"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="cursor-grab text-muted-foreground hover:text-foreground touch-none"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
        <select
          className="border rounded px-1 py-0.5 text-sm"
          value={field.type}
          onChange={(e) =>
            onUpdate(field.id, { type: e.target.value as FieldType })
          }
        >
          {FIELD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          className="border rounded px-2 py-1 flex-1"
          value={field.label}
          onChange={(e) => onUpdate(field.id, { label: e.target.value })}
        />
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={!!field.required}
            onChange={(e) => onUpdate(field.id, { required: e.target.checked })}
          />
          required
        </label>
        <button
          className="text-destructive hover:opacity-80"
          onClick={() => onRemove(field.id)}
          type="button"
          aria-label="Delete field"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  );
};
