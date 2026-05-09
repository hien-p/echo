"use client";

import { useEffect, useMemo, useState } from "react";
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
import { executeSponsored } from "@/lib/echo/sponsor";
import { uploadJsonViaPublisher } from "@/lib/echo/walrus";
import { resolveNameToAddress } from "@/lib/echo/suins";
import { FormPreview } from "./FormPreview";

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
    help: "Anyone can read submissions in plain text. Best for community-facing surveys, recaps, and feedback you want to publish.",
  },
  {
    value: PrivacyTier.AdminOnly,
    label: "Admin only",
    help: "Encrypted; only you (and any co-admins you add below) can read submissions. Respondents see nothing after submitting.",
  },
  {
    value: PrivacyTier.Threshold,
    label: "Multi-admin (any one decrypts)",
    help: "Encrypted; every co-admin you add gets their own cap, and any one of them can read submissions independently. Real m-of-n threshold (require multiple sigs) is on the v0.3 roadmap.",
  },
  {
    value: PrivacyTier.TimeLocked,
    label: "Time-locked",
    help: "Encrypted until a chosen unlock date. After that timestamp anyone (you, respondents, the public) can read — the chain enforces it. Useful for sealed predictions, pre-registered hypotheses.",
  },
  {
    value: PrivacyTier.Conditional,
    label: "Conditional (advanced)",
    help: "Encrypted with a custom on-chain rule. The Move predicate is a stub today — pick AdminOnly or Time-locked unless you're prototyping a custom condition.",
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
  // Threshold tier metadata: kept at fixed n=1, m=1 for now since the
  // current OR-of-N implementation doesn't enforce real m-of-n at the
  // Seal layer. Move's create_form still needs valid thresholds when tier
  // === Threshold (assert n>0 && n<=m), so 1/1 is the safe default.
  const thresholdN = 1;
  const thresholdM = 1;
  const [unlockMs, setUnlockMs] = useState("");
  const [policyId, setPolicyId] = useState("");
  // Conditional-tier decrypt-time predicate. Empty type = no extra gate.
  const [condType, setCondType] = useState<"" | "token" | "nft" | "suins">("");
  const [condCoinType, setCondCoinType] = useState("");
  const [condMinAmount, setCondMinAmount] = useState("1");
  const [condNftType, setCondNftType] = useState("");
  const [condDomain, setCondDomain] = useState("");
  // Co-admins (extra cap recipients) — relevant for any encrypted tier where
  // the form should be jointly managed. Empty by default; the creator's own
  // address always gets a cap. Stored as comma/newline-separated string and
  // parsed at submit time. Tokens can be hex addresses OR SuiNS names; we
  // resolve names asynchronously via the testnet API and cache results.
  const [coAdminsText, setCoAdminsText] = useState("");
  const [resolvedAdmins, setResolvedAdmins] = useState<
    Array<{ raw: string; kind: "address" | "suins"; address: string | null }>
  >([]);
  useEffect(() => {
    let cancelled = false;
    const tokens = parseCoAdminTokens(coAdminsText);
    // Optimistic: addresses resolve to themselves immediately; SuiNS pending.
    setResolvedAdmins(
      tokens.map((t) => ({
        raw: t.raw,
        kind: t.kind,
        address: t.kind === "address" ? t.raw : null,
      })),
    );
    const suinsTokens = tokens.filter((t) => t.kind === "suins");
    if (suinsTokens.length === 0) return;
    void (async () => {
      const updates = await Promise.all(
        suinsTokens.map(async (t) => {
          const addr = await resolveNameToAddress(t.raw);
          return { raw: t.raw, address: addr };
        }),
      );
      if (cancelled) return;
      setResolvedAdmins((prev) =>
        prev.map((p) => {
          const u = updates.find((x) => x.raw === p.raw);
          return u ? { ...p, address: u.address } : p;
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [coAdminsText]);
  const [fields, setFields] = useState<FormField[]>(
    blank.fields.map((f) => ({ ...f, id: newFieldId() }) as FormField),
  );
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "saving"; step: string }
    | { kind: "saved"; formId: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [mode, setMode] = useState<"visual" | "json">("visual");
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const packageId = clientConfig.ECHO_PACKAGE_ID;
  const packageDeployed = packageId.length > 0 && packageId.startsWith("0x");

  const schema = useMemo<FormSchema>(() => {
    const out: FormSchema = { version: 1, fields };
    if (tier === PrivacyTier.Conditional && condType) {
      out.decryptCondition = {
        type: condType,
        ...(condType === "token"
          ? { coinType: condCoinType.trim(), minAmount: condMinAmount.trim() }
          : {}),
        ...(condType === "nft" ? { nftType: condNftType.trim() } : {}),
        ...(condType === "suins" ? { domain: condDomain.trim() } : {}),
      };
    }
    return out;
  }, [
    fields,
    tier,
    condType,
    condCoinType,
    condMinAmount,
    condNftType,
    condDomain,
  ]);
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

      setStatus({
        kind: "saving",
        step: "Uploading schema to Walrus (publisher)…",
      });
      const { blobId: schemaBlobId } = await uploadJsonViaPublisher(schema);

      setStatus({
        kind: "saving",
        step: "Uploading metadata to Walrus (publisher)…",
      });
      const { blobId: metadataBlobId } = await uploadJsonViaPublisher(metadata);

      setStatus({
        kind: "saving",
        step: "Creating form on chain (gas sponsored)…",
      });
      // Use the live-resolved list (hex + resolved SuiNS); silently drop any
      // .sui name that didn't resolve so the create_form call doesn't ship
      // an invalid address. The UI hint warned the user.
      const extraAdmins = resolvedAdmins
        .filter((r) => !!r.address)
        .map((r) => r.address!);
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
        extraAdmins,
      });

      const sponsored = await executeSponsored({
        tx,
        sender: currentAccount.address,
        suiClient,
        dAppKit,
        waitForEffects: true,
      });

      // Form is the only shared object created in this tx; FormOwnerCap is
      // address-owned. Filter changedObjects to find the Created+Shared one.
      const created = sponsored.effects?.changedObjects ?? [];
      const formChange = created.find(
        (c) => c.idOperation === "Created" && c.outputOwner?.$kind === "Shared",
      );
      const formId = formChange?.objectId ?? "";
      if (!formId) {
        setStatus({
          kind: "error",
          message: `Form created (digest ${sponsored.digest.slice(0, 12)}…) but couldn't extract Form id from effects. Open My forms to see it.`,
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

  const enterJsonMode = () => {
    setJsonText(
      JSON.stringify(
        {
          metadata: { title, description },
          tier,
          schema,
        },
        null,
        2,
      ),
    );
    setJsonError(null);
    setMode("json");
  };

  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonText) as {
        metadata?: { title?: string; description?: string };
        tier?: number;
        schema?: { version?: number; fields?: FormField[] };
      };
      if (parsed.metadata?.title !== undefined) setTitle(parsed.metadata.title);
      if (parsed.metadata?.description !== undefined)
        setDescription(parsed.metadata.description);
      if (parsed.tier !== undefined) setTier(parsed.tier as PrivacyTier);
      if (Array.isArray(parsed.schema?.fields)) {
        setFields(
          parsed.schema!.fields!.map((f) => ({
            ...f,
            id: f.id ?? newFieldId(),
          })),
        );
      }
      setJsonError(null);
      setMode("visual");
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] gap-md">
      <div className="flex flex-col gap-md">
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setMode("visual")}
            className={cn(
              "border rounded px-3 py-1",
              mode === "visual"
                ? "bg-foreground text-background"
                : "hover:bg-accent",
            )}
          >
            Visual
          </button>
          <button
            type="button"
            onClick={enterJsonMode}
            className={cn(
              "border rounded px-3 py-1",
              mode === "json"
                ? "bg-foreground text-background"
                : "hover:bg-accent",
            )}
          >
            Edit JSON
          </button>
        </div>

        {mode === "json" && (
          <BuilderSection title="Schema JSON">
            <textarea
              className="border rounded px-2 py-1 font-mono text-xs min-h-[400px]"
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              spellCheck={false}
            />
            <div className="flex gap-2 items-center">
              <button
                type="button"
                onClick={applyJson}
                className="border rounded px-3 py-1 text-sm bg-foreground text-background hover:opacity-90"
              >
                Apply &amp; switch back to visual
              </button>
              {jsonError && (
                <span className="text-xs text-destructive">{jsonError}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Edit <code>{`{ metadata, tier, schema }`}</code> directly. Apply
              validates JSON before writing back to state. Visual save flow
              still gates on chain-side validation.
            </p>
          </BuilderSection>
        )}

        {mode === "visual" && (
          <>
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
              {tier === PrivacyTier.TimeLocked && (
                <Field label="Unlock at">
                  <input
                    type="datetime-local"
                    className="border rounded px-2 py-1 w-fit"
                    value={unlockMsToLocalInput(unlockMs)}
                    min={localInputNow()}
                    onChange={(e) =>
                      setUnlockMs(localInputToUnlockMs(e.target.value))
                    }
                  />
                  {unlockMs && (
                    <p className="text-xs text-muted-foreground">
                      Anyone can decrypt after{" "}
                      <strong>
                        {new Date(Number(unlockMs)).toLocaleString()}
                      </strong>{" "}
                      ({humanRelative(Number(unlockMs))}).
                    </p>
                  )}
                </Field>
              )}
              {tier === PrivacyTier.Conditional && (
                <>
                  <Field label="Policy ID (free-form tag)">
                    <input
                      className="border rounded px-2 py-1 w-full"
                      placeholder="airdrop_holder_v1"
                      value={policyId}
                      onChange={(e) => setPolicyId(e.target.value)}
                    />
                  </Field>
                  <Field label="Decrypt requires (optional, soft gate)">
                    <select
                      className="border rounded px-2 py-1 w-fit"
                      value={condType}
                      onChange={(e) =>
                        setCondType(
                          e.target.value as "" | "token" | "nft" | "suins",
                        )
                      }
                    >
                      <option value="">— no extra condition —</option>
                      <option value="token">Hold ≥ N of a token</option>
                      <option value="nft">Hold an NFT type</option>
                      <option value="suins">Own a specific SuiNS name</option>
                    </select>
                    {condType === "token" && (
                      <div className="flex flex-col gap-1 mt-1">
                        <input
                          className="border rounded px-2 py-1 w-full text-xs font-mono"
                          placeholder="coin type, e.g. 0x2::sui::SUI"
                          value={condCoinType}
                          onChange={(e) => setCondCoinType(e.target.value)}
                        />
                        <input
                          className="border rounded px-2 py-1 w-32 text-xs"
                          placeholder="min amount"
                          value={condMinAmount}
                          onChange={(e) => setCondMinAmount(e.target.value)}
                        />
                      </div>
                    )}
                    {condType === "nft" && (
                      <input
                        className="border rounded px-2 py-1 w-full text-xs font-mono mt-1"
                        placeholder="NFT type, e.g. 0xPKG::shrimp::Shrimp"
                        value={condNftType}
                        onChange={(e) => setCondNftType(e.target.value)}
                      />
                    )}
                    {condType === "suins" && (
                      <input
                        className="border rounded px-2 py-1 w-full text-xs mt-1"
                        placeholder="alice.sui"
                        value={condDomain}
                        onChange={(e) => setCondDomain(e.target.value)}
                      />
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Soft client-side gate at decrypt time. The Move predicate
                      still only checks the FormOwnerCap, so an owner with the
                      cap can technically bypass the condition. Real on-chain
                      enforcement is v0.3.
                    </p>
                  </Field>
                </>
              )}
              {tier !== PrivacyTier.Public && (
                <Field label="Co-admins (optional)">
                  <textarea
                    className="border rounded px-2 py-1 w-full font-mono text-xs"
                    rows={3}
                    placeholder="0x... addresses or alice.sui names, one per line or comma-separated. Each gets a FormOwnerCap and can decrypt as you can."
                    value={coAdminsText}
                    onChange={(e) => setCoAdminsText(e.target.value)}
                  />
                  {resolvedAdmins.length > 0 && (
                    <ul className="text-xs flex flex-col gap-0.5 mt-1">
                      {resolvedAdmins.map((r) => (
                        <li
                          key={r.raw}
                          className="flex items-center gap-2 font-mono"
                        >
                          <span
                            className={cn(
                              "inline-block w-1.5 h-1.5 rounded-full shrink-0",
                              r.address
                                ? "bg-emerald-500"
                                : "bg-amber-400 animate-pulse",
                            )}
                          />
                          <span>{r.raw}</span>
                          {r.kind === "suins" && r.address && (
                            <span className="text-muted-foreground">
                              → {r.address.slice(0, 10)}…
                            </span>
                          )}
                          {r.kind === "suins" && !r.address && (
                            <span className="text-amber-700">resolving…</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {(() => {
                      const ok = resolvedAdmins.filter((r) => r.address).length;
                      if (ok === 0) return "Just you — single admin (default).";
                      return `${ok + 1} admins total · any one can decrypt and manage the form.`;
                    })()}
                  </p>
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
              <TierBadge
                tier={tier}
                thresholdN={thresholdN}
                thresholdM={thresholdM}
                unlockMs={unlockMs}
              />
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
                  package via <code>publish/</code> and add the resulting object
                  ID to <code>dapp/.env</code> to enable on-chain saves.
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
          </>
        )}
      </div>

      <aside className="hidden lg:block">
        <FormPreview schema={schema} metadata={metadata} privacyTier={tier} />
      </aside>
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

function TierBadge({
  tier,
  unlockMs,
}: {
  tier: PrivacyTier;
  thresholdN: number; // unused; kept in the prop bag for caller compat
  thresholdM: number; // unused; kept in the prop bag for caller compat
  unlockMs: string;
}) {
  if (tier === PrivacyTier.Public) return null;
  let body: React.ReactNode = null;
  switch (tier) {
    case PrivacyTier.AdminOnly:
      body = (
        <>🔒 Encrypted with Seal · only your wallet can decrypt after save.</>
      );
      break;
    case PrivacyTier.Threshold:
      body = (
        <>
          🔒 Encrypted with Seal · multiple admins, any one can decrypt
          (OR-of-N).
        </>
      );
      break;
    case PrivacyTier.TimeLocked: {
      const ts = unlockMs ? new Date(Number(unlockMs)) : null;
      body = (
        <>
          ⏳ Encrypted with Seal · auto-decrypts at{" "}
          {ts && !isNaN(ts.getTime())
            ? ts.toISOString().replace("T", " ").slice(0, 16) + " UTC"
            : "(set unlock_ms above)"}
        </>
      );
      break;
    }
    case PrivacyTier.Conditional:
      body = (
        <>🔒 Encrypted with Seal · decrypts when on-chain policy matches.</>
      );
      break;
  }
  return (
    <p className="text-xs text-amber-700 dark:text-amber-400 inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-50 dark:bg-amber-950/30 w-fit">
      {body}
    </p>
  );
}

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
      {(field.type === "single_select" ||
        field.type === "multi_select" ||
        field.type === "dropdown") && (
        <OptionsEditor
          options={field.options}
          onChange={(options) => onUpdate(field.id, { options })}
        />
      )}
    </li>
  );
};

const OptionsEditor = ({
  options,
  onChange,
}: {
  options: { value: string; label: string }[];
  onChange: (next: { value: string; label: string }[]) => void;
}) => {
  const update = (
    i: number,
    patch: Partial<{ value: string; label: string }>,
  ) => onChange(options.map((o, j) => (i === j ? { ...o, ...patch } : o)));
  const remove = (i: number) => onChange(options.filter((_, j) => j !== i));
  const add = () => {
    const next = `opt${options.length + 1}`;
    onChange([
      ...options,
      { value: next, label: `Option ${options.length + 1}` },
    ]);
  };

  return (
    <details className="text-xs flex flex-col gap-1 ml-6 border-l pl-2" open>
      <summary className="cursor-pointer text-muted-foreground select-none">
        Options ({options.length})
      </summary>
      <ul className="flex flex-col gap-1 mt-1">
        {options.map((o, i) => (
          <li key={i} className="flex items-center gap-1">
            <input
              className="border rounded px-1 py-0.5 w-24 font-mono text-[11px]"
              value={o.value}
              placeholder="value"
              onChange={(e) => update(i, { value: e.target.value })}
            />
            <input
              className="border rounded px-1 py-0.5 flex-1"
              value={o.label}
              placeholder="label"
              onChange={(e) => update(i, { label: e.target.value })}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={options.length <= 1}
              className="text-destructive hover:opacity-80 disabled:opacity-40"
              aria-label="Remove option"
            >
              <Trash2 size={12} />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={add}
        className="border rounded px-2 py-0.5 w-fit hover:bg-accent inline-flex items-center gap-1 mt-1"
      >
        <Plus size={11} /> Add option
      </button>
    </details>
  );
};

// ---- Date helpers for the TimeLocked unlock picker -----------------------

/** Convert a stored unlock_ms string to the YYYY-MM-DDTHH:mm shape that
 *  <input type="datetime-local"> expects in the user's local zone. */
function unlockMsToLocalInput(unlockMs: string): string {
  if (!unlockMs) return "";
  const ms = Number(unlockMs);
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** Reverse: parse a datetime-local input back to unix ms (as string). */
function localInputToUnlockMs(local: string): string {
  if (!local) return "";
  const ms = new Date(local).getTime();
  return Number.isFinite(ms) ? String(ms) : "";
}

/** "now+5min" floor for the picker's min= attribute so users can't pick the past. */
function localInputNow(): string {
  return unlockMsToLocalInput(String(Date.now() + 5 * 60_000));
}

/** "in 2d 4h" / "in 17m" — shown next to the picker so the user can
 *  sanity-check the absolute date they just chose. */
function humanRelative(ms: number): string {
  const dt = ms - Date.now();
  if (dt <= 0) return "already past";
  const min = Math.floor(dt / 60_000);
  const hr = Math.floor(min / 60);
  const days = Math.floor(hr / 24);
  if (days > 0) return `in ~${days}d ${hr % 24}h`;
  if (hr > 0) return `in ~${hr}h ${min % 60}m`;
  return `in ~${min}m`;
}

/**
 * Parse a free-form textarea of co-admin addresses + .sui names into a list
 * of tokens. Hex addresses are kept as-is; .sui names are flagged for the
 * caller to resolve asynchronously via SuiNS.
 */
function parseCoAdminTokens(
  raw: string,
): Array<{ raw: string; kind: "address" | "suins" }> {
  const seen = new Set<string>();
  const out: Array<{ raw: string; kind: "address" | "suins" }> = [];
  for (const tok of raw.split(/[\s,]+/)) {
    const t = tok.trim().toLowerCase();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    if (t.startsWith("0x") && t.length >= 6) {
      out.push({ raw: t, kind: "address" });
    } else if (/\.sui$/i.test(t) || /^[a-z0-9-]{3,}$/.test(t)) {
      // bare slug like "alice" treated as alice.sui
      out.push({
        raw: t.endsWith(".sui") ? t : `${t}.sui`,
        kind: "suins",
      });
    }
  }
  return out;
}
