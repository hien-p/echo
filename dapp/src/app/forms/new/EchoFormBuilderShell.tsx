"use client";

/**
 * /forms/new — Echo Form Builder, 3-pane.
 *
 * Sourced from `~/Downloads/memwal_newversion/form-builder.jsx`:
 * BuilderTopbar + PalettePane + CanvasPane + SettingsRail (privacy /
 * gating / AI / on-chain summary / publish progress). Real publish
 * wiring reuses uploadJsonViaPublisher + buildCreateFormTx +
 * executeSponsored from @/lib/echo so the schema/metadata land on
 * Walrus and the Form object anchors on Sui with sponsored gas.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
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
import { apiUrl, clientConfig } from "@/config/clientConfig";
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
import {
  BrutalistButton,
  SuiDroplet,
  WalrusMascot,
} from "@/components/general/FrameForms";
import { EchoNavRail } from "@/components/general/EchoNavRail";

// ────────────────────────────────────────────────────────────────────
// Constants — palette / tiers / AI prompts / publish steps
// ────────────────────────────────────────────────────────────────────

type PaletteItem = {
  kind: FieldType;
  glyph: string;
  label: string;
  hint: string;
};
type PaletteGroup = { group: string; items: PaletteItem[] };

const PALETTE: PaletteGroup[] = [
  {
    group: "text",
    items: [
      {
        kind: "short_text",
        glyph: "Aa",
        label: "short text",
        hint: "one-line answer",
      },
      {
        kind: "long_text",
        glyph: "¶",
        label: "long text",
        hint: "multi-line textarea",
      },
      {
        kind: "rich_text",
        glyph: "M↓",
        label: "rich text",
        hint: "markdown + uploads",
      },
      { kind: "url", glyph: "↗", label: "url", hint: "link with validation" },
    ],
  },
  {
    group: "choice",
    items: [
      {
        kind: "single_select",
        glyph: "◉",
        label: "single",
        hint: "radio · pick one",
      },
      {
        kind: "multi_select",
        glyph: "☑",
        label: "multi",
        hint: "checkboxes · pick many",
      },
      {
        kind: "dropdown",
        glyph: "▾",
        label: "dropdown",
        hint: "select from list",
      },
      {
        kind: "checkbox",
        glyph: "Y/N",
        label: "yes / no",
        hint: "binary toggle",
      },
    ],
  },
  {
    group: "scale",
    items: [
      {
        kind: "rating",
        glyph: "☆",
        label: "rating",
        hint: "1–10 numeric scale",
      },
    ],
  },
  {
    group: "media",
    items: [
      {
        kind: "file_upload",
        glyph: "▢",
        label: "file",
        hint: "any file · walrus blob",
      },
      {
        kind: "screenshot",
        glyph: "▣",
        label: "screenshot",
        hint: "image · paste or drop",
      },
      { kind: "video", glyph: "▶", label: "video", hint: "mp4 · webm · gif" },
    ],
  },
  {
    group: "special",
    items: [
      {
        kind: "signature",
        glyph: "✎",
        label: "signature",
        hint: "draw or wallet-sign",
      },
      { kind: "date", glyph: "◯", label: "date", hint: "calendar picker" },
    ],
  },
];

type TierMeta = {
  idx: PrivacyTier;
  key: string;
  name: string;
  sub: string;
  color: string;
};

const TIERS: TierMeta[] = [
  {
    idx: PrivacyTier.Public,
    key: "public",
    name: "Public",
    sub: "anyone can fill · plaintext on chain",
    color: "#0A0A0A",
  },
  {
    idx: PrivacyTier.AdminOnly,
    key: "admin",
    name: "Admin only",
    sub: "wallet-gated · only you can decrypt",
    color: "#4DA2FF",
  },
  {
    idx: PrivacyTier.Threshold,
    key: "threshold",
    name: "Threshold",
    sub: "m-of-n admin shares to decrypt",
    color: "#A06EE9",
  },
  {
    idx: PrivacyTier.TimeLocked,
    key: "timelock",
    name: "Time-locked",
    sub: "sealed until unlock ts",
    color: "#6CD3D6",
  },
  {
    idx: PrivacyTier.Conditional,
    key: "cond",
    name: "Conditional",
    sub: "unlocks when a Move rule passes",
    color: "#E8A540",
  },
];

const AI_PROMPTS = [
  "Hackathon feedback — 5 questions",
  "Customer NPS for a SaaS",
  "Bug bounty intake — public",
  "Internal team retro · last sprint",
];

const PUBLISH_STEPS = [
  { k: "schema", label: "upload schema", sub: "walrus blob" },
  { k: "metadata", label: "upload metadata", sub: "walrus blob" },
  { k: "object", label: "create form object", sub: "sui tx" },
] as const;

let fieldCounter = 0;
const newFieldId = () => `f${++fieldCounter}_${Date.now().toString(36)}`;

function paletteMeta(kind: FieldType): PaletteItem {
  for (const grp of PALETTE) {
    for (const it of grp.items) if (it.kind === kind) return it;
  }
  return { kind, glyph: "?", label: kind, hint: "" };
}

function newField(kind: FieldType): FormField {
  const base = { id: newFieldId(), label: "", required: false };
  switch (kind) {
    case "single_select":
    case "multi_select":
    case "dropdown":
      return {
        ...base,
        type: kind,
        options: [
          { value: "opt1", label: "option one" },
          { value: "opt2", label: "option two" },
        ],
      };
    case "rating":
      return { ...base, type: kind, scale: 5 };
    case "file_upload":
    case "screenshot":
    case "video":
      return { ...base, type: kind, maxSizeBytes: 10 * 1024 * 1024 };
    default:
      return { ...base, type: kind } as FormField;
  }
}

// ────────────────────────────────────────────────────────────────────
// Small UI primitives
// ────────────────────────────────────────────────────────────────────

function Mono({
  children,
  size = 11,
  color = "var(--echo-mut)",
}: {
  children: React.ReactNode;
  size?: number;
  color?: string;
}) {
  return (
    <span className="echo-mono" style={{ fontSize: size, color }}>
      {children}
    </span>
  );
}

function FrameCard({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`echo-card bld-pane ${className ?? ""}`} style={style}>
      {children}
    </div>
  );
}

function RailHead({ label, hint }: { label: string; hint?: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 6,
      }}
    >
      <Mono>{label}</Mono>
      {hint && (
        <Mono size={9} color="var(--echo-mut-2)">
          {hint}
        </Mono>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Topbar — breadcrumb + draft status + save + sign-and-publish
// ────────────────────────────────────────────────────────────────────

function formatRelative(ms: number, nowMs: number): string {
  const diff = Math.max(0, Math.floor((nowMs - ms) / 1000));
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function BuilderTopbar({
  dirty,
  publishing,
  canPublish,
  lastSavedAt,
  onSaveDraft,
  onPublish,
}: {
  dirty: boolean;
  publishing: boolean;
  canPublish: boolean;
  lastSavedAt: number | null;
  onSaveDraft: () => void;
  onPublish: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!lastSavedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lastSavedAt]);

  const statusText = dirty
    ? lastSavedAt
      ? `unsaved · autosaved ${formatRelative(lastSavedAt, now)}`
      : "unsaved · not saved yet"
    : lastSavedAt
      ? `draft saved · ${formatRelative(lastSavedAt, now)}`
      : "draft ready";

  return (
    <header className="bld-topbar">
      <div className="echo-container bld-topbar__inner">
        <div className="bld-topbar__left">
          <Link href="/forms" className="bld-back">
            ← all forms
          </Link>
          <span>
            <Mono size={10} color="var(--echo-mut-2)">
              forms
            </Mono>
            <span style={{ color: "#D6D6D6", margin: "0 6px" }}>/</span>
            <Mono size={10} color="var(--echo-ink)">
              new
            </Mono>
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <span className={`bld-status ${dirty ? "is-dirty" : ""}`}>
            <span className="bld-status__dot" />
            {statusText}
          </span>
        </div>
        <div className="bld-topbar__right">
          <button
            className="bld-save-draft"
            type="button"
            onClick={onSaveDraft}
          >
            <span style={{ fontFamily: "JetBrains Mono, monospace" }}>▢</span>
            save draft
          </button>
          <BrutalistButton
            size="md"
            className="bld-publish"
            onClick={onPublish}
            disabled={publishing || !canPublish}
          >
            {publishing ? "publishing…" : "sign & publish"}
            <span style={{ fontSize: "1.1em" }}>→</span>
          </BrutalistButton>
        </div>
      </div>
    </header>
  );
}

// ────────────────────────────────────────────────────────────────────
// Palette pane — left rail, click to add
// ────────────────────────────────────────────────────────────────────

function PalettePane({ onAdd }: { onAdd: (kind: FieldType) => void }) {
  return (
    <aside className="bld-pane">
      <RailHead label="question types" hint="click to add" />
      {PALETTE.map((grp) => (
        <div key={grp.group} className="palette-group">
          <Mono size={9} color="var(--echo-mut-2)">
            {grp.group}
          </Mono>
          <div className="palette-list">
            {grp.items.map((it) => (
              <button
                key={it.kind}
                className="palette-item"
                onClick={() => onAdd(it.kind)}
                title={it.hint}
                type="button"
              >
                <span className="palette-item__glyph">{it.glyph}</span>
                <span>
                  <span className="palette-item__name">{it.label}</span>
                  <span className="palette-item__hint">{it.hint}</span>
                </span>
                <span className="palette-item__add">＋</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <div
        style={{
          marginTop: 14,
          padding: 12,
          borderTop: "1px dashed var(--echo-rail)",
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
        }}
      >
        <WalrusMascot pose="primary" size={48} />
        <div>
          <Mono size={9} color="var(--echo-mut)">
            tip
          </Mono>
          <p
            style={{
              fontSize: 12,
              color: "var(--echo-mut)",
              margin: "4px 0 0",
              lineHeight: 1.5,
            }}
          >
            Click a type to drop it into the canvas, then edit the title inline.
          </p>
        </div>
      </div>
    </aside>
  );
}

// ────────────────────────────────────────────────────────────────────
// Canvas — sortable list of question cards
// ────────────────────────────────────────────────────────────────────

function CanvasPane({
  title,
  description,
  fields,
  selectedId,
  onTitle,
  onDescription,
  onSelect,
  onUpdate,
  onRemove,
  onDuplicate,
  onAdd,
  onDragEnd,
}: {
  title: string;
  description: string;
  fields: FormField[];
  selectedId: string | null;
  onTitle: (v: string) => void;
  onDescription: (v: string) => void;
  onSelect: (id: string) => void;
  onUpdate: (id: string, patch: Partial<FormField>) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onAdd: (kind: FieldType) => void;
  onDragEnd: (e: DragEndEvent) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  return (
    <section className="bld-pane bld-canvas">
      <Mono>form intro</Mono>
      <input
        className="canvas-title"
        value={title}
        onChange={(e) => onTitle(e.target.value)}
        placeholder="untitled form"
      />
      <textarea
        className="canvas-desc"
        value={description}
        onChange={(e) => onDescription(e.target.value)}
        placeholder="describe what you're collecting…"
        rows={2}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={fields.map((f) => f.id)}
          strategy={verticalListSortingStrategy}
        >
          <ol className="canvas-list">
            {fields.map((f, i) => (
              <SortableQuestion
                key={f.id}
                field={f}
                idx={i + 1}
                selected={selectedId === f.id}
                onSelect={() => onSelect(f.id)}
                onUpdate={(patch) => onUpdate(f.id, patch)}
                onRemove={() => onRemove(f.id)}
                onDuplicate={() => onDuplicate(f.id)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      <div className="canvas-add-row">
        <button className="add-btn" onClick={() => onAdd("short_text")}>
          <span>＋</span> add question
        </button>
        <span className="add-row__sep" />
        <Mono size={10} color="var(--echo-mut-2)">
          or pick a type from the palette →
        </Mono>
      </div>

      <div
        style={{
          marginTop: 24,
          padding: "16px 18px",
          background: "var(--echo-paper-2)",
          border: "1px solid var(--echo-rail)",
          borderRadius: 12,
        }}
      >
        <Mono>end of form</Mono>
        <p
          style={{
            fontSize: 16,
            fontWeight: 500,
            margin: "6px 0 4px",
            color: "var(--echo-ink)",
          }}
        >
          say thanks.
        </p>
        <p style={{ fontSize: 12, color: "var(--echo-mut)", margin: 0 }}>
          Respondents see a Walrus receipt + your custom message after submit.
        </p>
      </div>
    </section>
  );
}

function SortableQuestion({
  field,
  idx,
  selected,
  onSelect,
  onUpdate,
  onRemove,
  onDuplicate,
}: {
  field: FormField;
  idx: number;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<FormField>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
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
  const meta = paletteMeta(field.type);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`q-card ${selected ? "is-selected" : ""}`}
      onClick={onSelect}
    >
      <div className="q-card__rail" aria-hidden="true">
        <span className="q-handle" {...attributes} {...listeners}>
          ⋮⋮
        </span>
        <span className="q-num">{String(idx).padStart(2, "0")}</span>
      </div>
      <div>
        <div className="q-card__head">
          <span className="q-kind">
            <span style={{ fontFamily: "JetBrains Mono, monospace" }}>
              {meta.glyph}
            </span>
            <span>{meta.label}</span>
          </span>
          <label
            className={`q-req ${field.required ? "is-on" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={!!field.required}
              onChange={(e) => onUpdate({ required: e.target.checked })}
            />
            required
          </label>
          <div className="q-toolbar">
            <button
              className="q-tb-btn"
              title="duplicate"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate();
              }}
              type="button"
            >
              ▢
            </button>
            <button
              className="q-tb-btn q-tb-btn--danger"
              title="delete"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              type="button"
            >
              ×
            </button>
          </div>
        </div>
        <input
          className="q-title"
          value={field.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="ask a question…"
          onClick={(e) => e.stopPropagation()}
        />
        <input
          className="q-sub"
          value={field.description ?? ""}
          onChange={(e) => onUpdate({ description: e.target.value })}
          placeholder="optional helper text"
          onClick={(e) => e.stopPropagation()}
        />
        <QuestionPreview field={field} onUpdate={onUpdate} />
      </div>
    </li>
  );
}

function QuestionPreview({
  field,
  onUpdate,
}: {
  field: FormField;
  onUpdate: (patch: Partial<FormField>) => void;
}) {
  if (field.type === "short_text" || field.type === "url") {
    return <div className="q-preview">answer will appear here…</div>;
  }
  if (field.type === "long_text" || field.type === "rich_text") {
    return <div className="q-preview">multi-line answer field…</div>;
  }
  if (field.type === "rating") {
    const scale = field.scale || 5;
    return (
      <div className="q-preview q-preview--rating">
        {Array.from({ length: scale }).map((_, i) => (
          <span key={i} className="q-rate">
            {i + 1}
          </span>
        ))}
      </div>
    );
  }
  if (
    field.type === "single_select" ||
    field.type === "multi_select" ||
    field.type === "dropdown"
  ) {
    const options = field.options ?? [];
    return (
      <div className="q-preview q-preview--options">
        {options.map((o, i) => (
          <div key={`${o.value}-${i}`} className="q-opt-row">
            <span className="q-opt-key">{String.fromCharCode(65 + i)}</span>
            <input
              className="q-opt-input"
              value={o.label}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                const next = options.slice();
                next[i] = { ...o, label: e.target.value };
                onUpdate({ options: next });
              }}
            />
            <button
              className="q-tb-btn"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onUpdate({
                  options: options.filter((_, j) => j !== i),
                });
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          className="q-add-opt"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const next = options.slice();
            next.push({
              value: `opt${next.length + 1}`,
              label: "new option",
            });
            onUpdate({ options: next });
          }}
        >
          ＋ add option
        </button>
      </div>
    );
  }
  if (field.type === "checkbox") {
    return (
      <div className="q-preview q-preview--yn">
        <span className="yn-btn">yes</span>
        <span className="yn-btn">no</span>
      </div>
    );
  }
  if (
    field.type === "file_upload" ||
    field.type === "screenshot" ||
    field.type === "video"
  ) {
    return (
      <div className="q-preview">
        ＋ {paletteMeta(field.type).label} · drop or browse
      </div>
    );
  }
  if (field.type === "date") {
    return <div className="q-preview">📅 calendar picker…</div>;
  }
  if (field.type === "signature") {
    return <div className="q-preview">✎ draw or wallet-sign…</div>;
  }
  return (
    <div className="q-preview">{paletteMeta(field.type).label} preview…</div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Settings rail — privacy + gating + AI + on-chain summary + publish
// ────────────────────────────────────────────────────────────────────

type GatingState = {
  anonAllowed: boolean;
  gasSponsor: boolean;
  walletGated: boolean;
  collectEmail: boolean;
};

function PrivacyTierPicker({
  value,
  onChange,
}: {
  value: PrivacyTier;
  onChange: (v: PrivacyTier) => void;
}) {
  return (
    <FrameCard>
      <RailHead label="privacy tier" hint="5 options" />
      <div className="tier-cards">
        {TIERS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.idx)}
            className={`tier-card ${value === t.idx ? "is-on" : ""}`}
          >
            <span className="tier-card__sq" style={{ background: t.color }} />
            <div>
              <span className="tier-card__name">{t.name}</span>
              <span className="tier-card__sub">{t.sub}</span>
            </div>
            {value === t.idx && <span className="tier-card__check">✓</span>}
          </button>
        ))}
      </div>
    </FrameCard>
  );
}

function ToggleRow({
  label,
  sub,
  on,
  onChange,
}: {
  label: string;
  sub: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="setting-row" style={{ cursor: "pointer" }}>
      <div>
        <strong>{label}</strong>
        <Mono size={9} color="var(--echo-mut)">
          {sub}
        </Mono>
      </div>
      <span
        className={`anon-toggle__box ${on ? "is-on" : ""}`}
        onClick={(e) => {
          e.preventDefault();
          onChange(!on);
        }}
      >
        <span className="anon-toggle__knob" />
      </span>
    </label>
  );
}

function GatingPanel({
  tier,
  state,
  onState,
  thresholdK,
  thresholdN,
  onThresholdK,
  onThresholdN,
  unlockMs,
  onUnlockMs,
}: {
  tier: PrivacyTier;
  state: GatingState;
  onState: (patch: Partial<GatingState>) => void;
  thresholdK: number;
  thresholdN: number;
  onThresholdK: (v: number) => void;
  onThresholdN: (v: number) => void;
  unlockMs: string;
  onUnlockMs: (v: string) => void;
}) {
  return (
    <FrameCard>
      <RailHead label="gating & behavior" />
      <div className="setting-rows">
        <ToggleRow
          label="allow anonymous submissions"
          sub="respondents can submit with an ephemeral key"
          on={state.anonAllowed}
          onChange={(v) => onState({ anonAllowed: v })}
        />
        <ToggleRow
          label="sponsor gas (enoki)"
          sub="you pay · respondents need 0 SUI"
          on={state.gasSponsor}
          onChange={(v) => onState({ gasSponsor: v })}
        />
        <ToggleRow
          label="require wallet for any tier"
          sub="overrides per-tier defaults"
          on={state.walletGated}
          onChange={(v) => onState({ walletGated: v })}
        />
        <ToggleRow
          label="collect email (off-chain)"
          sub="stored in walrus only · not on chain"
          on={state.collectEmail}
          onChange={(v) => onState({ collectEmail: v })}
        />
        {tier === PrivacyTier.Threshold && (
          <div className="setting-row">
            <div>
              <strong>threshold k / n</strong>
              <Mono size={9} color="var(--echo-mut)">
                m-of-n admin approvals
              </Mono>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <select
                className="tier-select"
                value={thresholdK}
                onChange={(e) => onThresholdK(parseInt(e.target.value, 10))}
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span style={{ color: "var(--echo-mut-2)" }}>of</span>
              <select
                className="tier-select"
                value={thresholdN}
                onChange={(e) => onThresholdN(parseInt(e.target.value, 10))}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {tier === PrivacyTier.TimeLocked && (
          <div className="setting-row">
            <div>
              <strong>unlock timestamp</strong>
              <Mono size={9} color="var(--echo-mut)">
                unix milliseconds
              </Mono>
            </div>
            <input
              type="number"
              className="bld-num-input"
              value={unlockMs}
              onChange={(e) => onUnlockMs(e.target.value)}
              placeholder={String(Date.now() + 30 * 86400_000)}
              style={{ width: 160 }}
            />
          </div>
        )}
        {tier === PrivacyTier.Conditional && (
          <div className="setting-row">
            <div>
              <strong>conditional policy</strong>
              <Mono size={9} color="var(--echo-mut)">
                move rule unlocks the form
              </Mono>
            </div>
            <Mono size={9} color="var(--echo-mut)">
              configured at admin
            </Mono>
          </div>
        )}
      </div>
    </FrameCard>
  );
}

function AIGenerator({
  value,
  onChange,
  onGenerate,
  busy,
}: {
  value: string;
  onChange: (v: string) => void;
  onGenerate: () => void;
  busy: boolean;
}) {
  return (
    <FrameCard>
      <div className="ai-card__head">
        <WalrusMascot pose="peace" size={40} />
        <div>
          <Mono>draft with AI</Mono>
          <Mono size={9} color="var(--echo-mut)">
            memwal · ~3s
          </Mono>
        </div>
      </div>
      <textarea
        className="ai-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="describe the form · we'll draft 5–10 questions…"
        rows={2}
      />
      <div className="ai-suggestions">
        {AI_PROMPTS.map((p) => (
          <button
            key={p}
            className="ai-suggest"
            type="button"
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        ))}
      </div>
      <BrutalistButton
        size="sm"
        onClick={onGenerate}
        disabled={busy || !value.trim()}
      >
        {busy ? "generating…" : "generate & insert"}
        <span style={{ fontSize: "1.1em" }}>✦</span>
      </BrutalistButton>
    </FrameCard>
  );
}

function OnChainSummary({
  tier,
  fieldCount,
  schemaBytes,
  metadataBytes,
  gasSponsor,
  gasEstimateSui,
  packageId,
}: {
  tier: PrivacyTier;
  fieldCount: number;
  schemaBytes: number;
  metadataBytes: number;
  gasSponsor: boolean;
  gasEstimateSui: number | null;
  packageId: string;
}) {
  const tierName = TIERS.find((t) => t.idx === tier)?.name ?? "?";
  const totalBytes = schemaBytes + metadataBytes;
  const gasText =
    gasEstimateSui === null ? "—" : `${gasEstimateSui.toFixed(4)} SUI`;
  const pkgShort = packageId
    ? `${packageId.slice(0, 6)}…${packageId.slice(-4)}`
    : "not set";
  return (
    <FrameCard>
      <RailHead label="on-chain summary" hint={clientConfig.SUI_NETWORK} />
      <ul className="onchain-list">
        <li>
          <span>tier</span> <span className="oc-val">{tierName}</span>
        </li>
        <li>
          <span>questions</span>{" "}
          <span className="oc-val mono">{fieldCount}</span>
        </li>
        <li>
          <span>walrus payload</span>{" "}
          <span className="oc-val mono">
            ~{(totalBytes / 1024).toFixed(2)} KB
          </span>
        </li>
        <li>
          <span>gas estimate</span>{" "}
          <span className="oc-val mono">{gasText}</span>
        </li>
        <li>
          <span>your wallet pays</span>
          <span
            className="oc-val"
            style={{
              color: gasSponsor ? "var(--echo-success)" : "var(--echo-ink)",
            }}
          >
            {gasSponsor
              ? "✓ sponsored"
              : gasEstimateSui !== null
                ? `${gasEstimateSui.toFixed(4)} SUI`
                : "—"}
          </span>
        </li>
        <li>
          <span>package</span> <span className="oc-val mono">{pkgShort}</span>
        </li>
      </ul>
    </FrameCard>
  );
}

type PublishStatus =
  | { kind: "idle" }
  | { kind: "running"; step: number }
  | { kind: "done"; formId: string }
  | { kind: "error"; message: string };

function PublishProgress({
  status,
  onCancel,
}: {
  status: PublishStatus;
  onCancel: () => void;
}) {
  if (status.kind === "idle") return null;
  const step =
    status.kind === "running"
      ? status.step
      : status.kind === "done"
        ? PUBLISH_STEPS.length
        : 0;
  const done = status.kind === "done";
  const errored = status.kind === "error";

  return (
    <FrameCard>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Mono size={11}>
          <span
            className="bld-status__dot"
            style={{
              background: errored ? "#B91C1C" : done ? "#22C55E" : "#E8A540",
              marginRight: 8,
            }}
          />
          {errored ? "publish failed" : done ? "published" : "publishing…"}
        </Mono>
      </div>
      <div
        style={{
          margin: "12px 0",
          padding: "18px 12px",
          borderRadius: 12,
          background: "var(--echo-aurora-plate)",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <motion.div
          animate={done ? { y: [0, -4, 0] } : { y: [0, -6, 0] }}
          transition={{
            duration: done ? 1.6 : 2.4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <WalrusMascot pose={done ? "salute" : "primary"} size={100} />
        </motion.div>
      </div>
      <ol className="publish-steps">
        {PUBLISH_STEPS.map((s, i) => {
          const state = step > i ? "done" : step === i ? "active" : "pending";
          return (
            <li key={s.k} className={`pub-step is-${state}`}>
              <span className="pub-step__num">
                {state === "done" ? "✓" : i + 1}
              </span>
              <div className="pub-step__body">
                <strong>{s.label}</strong>
                <Mono size={9} color="var(--echo-mut)">
                  {s.sub}
                </Mono>
              </div>
              {state === "active" && <span className="pub-step__spin" />}
            </li>
          );
        })}
      </ol>
      {done && status.kind === "done" && (
        <div style={{ marginTop: 12 }}>
          <Mono size={9} color="var(--echo-mut)">
            form object
          </Mono>
          <code className="publish-id">{status.formId}</code>
          <div className="publish-cta-row">
            <BrutalistButton
              size="md"
              aurora
              href={`/forms/${status.formId}/admin`}
            >
              open admin <span style={{ fontSize: "1.1em" }}>→</span>
            </BrutalistButton>
            <BrutalistButton size="md" href={`/forms/${status.formId}`}>
              preview ↗
            </BrutalistButton>
          </div>
        </div>
      )}
      {errored && (
        <div style={{ marginTop: 10 }}>
          <Mono size={10} color="var(--echo-danger)">
            {status.kind === "error" ? status.message : ""}
          </Mono>
          <button
            className="add-btn"
            style={{ marginTop: 10 }}
            onClick={onCancel}
            type="button"
          >
            dismiss
          </button>
        </div>
      )}
    </FrameCard>
  );
}

// ────────────────────────────────────────────────────────────────────
// Main shell
// ────────────────────────────────────────────────────────────────────

export function EchoFormBuilderShell() {
  const router = useRouter();
  const currentAccount = useCurrentAccount();
  const dAppKit = useDAppKit();

  const [title, setTitle] = useState("untitled form");
  const [description, setDescription] = useState(
    "What feedback do you want to collect?",
  );
  const [tier, setTier] = useState<PrivacyTier>(PrivacyTier.Public);
  const [fields, setFields] = useState<FormField[]>(() => [
    {
      ...newField("short_text"),
      label: "What's your name?",
      required: true,
    } as FormField,
    {
      ...newField("rating"),
      label: "How likely are you to recommend?",
      description: "0 — never. 10 — already pitching.",
      required: true,
      scale: 10,
    } as FormField,
  ]);
  const [selectedId, setSelectedId] = useState<string | null>(
    fields[0]?.id ?? null,
  );
  const [gating, setGating] = useState<GatingState>({
    anonAllowed: true,
    gasSponsor: true,
    walletGated: false,
    collectEmail: false,
  });
  const [thresholdK, setThresholdK] = useState(2);
  const [thresholdN, setThresholdN] = useState(3);
  const [unlockMs, setUnlockMs] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [status, setStatus] = useState<PublishStatus>({ kind: "idle" });
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    setDirty(true);
  }, [
    title,
    description,
    tier,
    fields,
    gating,
    thresholdK,
    thresholdN,
    unlockMs,
  ]);

  const schema = useMemo<FormSchema>(() => ({ version: 1, fields }), [fields]);
  const metadata = useMemo<FormMetadata>(
    () => ({ title, description: description || undefined }),
    [title, description],
  );
  const schemaBytes = useMemo(
    () => new TextEncoder().encode(JSON.stringify(schema)).length,
    [schema],
  );
  const metadataBytes = useMemo(
    () => new TextEncoder().encode(JSON.stringify(metadata)).length,
    [metadata],
  );
  // Coarse gas estimate derived from on-chain payload size — Sui charges
  // for storage in proportion to bytes written. Formula based on observed
  // testnet costs for create_form txs. Replaced by the actual gas the
  // sponsored tx burned once publish completes.
  const [actualGasSui, setActualGasSui] = useState<number | null>(null);
  const gasEstimateSui = useMemo<number | null>(() => {
    if (actualGasSui !== null) return actualGasSui;
    if (fields.length === 0) return null;
    const totalBytes = schemaBytes + metadataBytes;
    return 0.002 + 0.0002 * fields.length + 0.0005 * (totalBytes / 1024);
  }, [actualGasSui, fields.length, schemaBytes, metadataBytes]);

  const addField = (kind: FieldType) => {
    const f = newField(kind);
    setFields((curr) => [...curr, f]);
    setSelectedId(f.id);
  };
  const updateField = (id: string, patch: Partial<FormField>) =>
    setFields((curr) =>
      curr.map((f) => (f.id === id ? ({ ...f, ...patch } as FormField) : f)),
    );
  const removeField = (id: string) =>
    setFields((curr) => curr.filter((f) => f.id !== id));
  const duplicateField = (id: string) =>
    setFields((curr) => {
      const idx = curr.findIndex((f) => f.id === id);
      if (idx < 0) return curr;
      const copy = { ...curr[idx], id: newFieldId() };
      const next = curr.slice();
      next.splice(idx + 1, 0, copy);
      return next;
    });
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setFields((curr) => {
      const oldIdx = curr.findIndex((f) => f.id === active.id);
      const newIdx = curr.findIndex((f) => f.id === over.id);
      if (oldIdx < 0 || newIdx < 0) return curr;
      return arrayMove(curr, oldIdx, newIdx);
    });
  };

  async function handleGenerateAI() {
    if (!aiPrompt.trim()) return;
    setAiBusy(true);
    try {
      const resp = await fetch(apiUrl("/api/forms/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt }),
      });
      if (!resp.ok) throw new Error(`AI generate failed (${resp.status})`);
      const data = (await resp.json()) as {
        title?: string;
        description?: string;
        fields?: FormField[];
      };
      if (data.title) setTitle(data.title);
      if (data.description) setDescription(data.description);
      if (Array.isArray(data.fields)) {
        const ingested = data.fields.map(
          (f) => ({ ...f, id: newFieldId() }) as FormField,
        );
        setFields(ingested);
        setSelectedId(ingested[0]?.id ?? null);
      }
      setAiPrompt("");
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setAiBusy(false);
    }
  }

  const packageId = clientConfig.ECHO_PACKAGE_ID;
  const packageDeployed = packageId.length > 0 && packageId.startsWith("0x");
  const canPublish = !!currentAccount && packageDeployed && fields.length > 0;

  async function handlePublish() {
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
    setStatus({ kind: "running", step: 0 });
    try {
      const suiClient = dAppKit.getClient();
      const { blobId: schemaBlobId } = await uploadJsonViaPublisher(schema);
      setStatus({ kind: "running", step: 1 });
      const { blobId: metadataBlobId } = await uploadJsonViaPublisher(metadata);
      setStatus({ kind: "running", step: 2 });

      const totalAdmins = 1;
      const requiredK = Math.max(1, Math.min(thresholdK, totalAdmins));
      const tx = buildCreateFormTx({
        packageId,
        senderAddress: currentAccount.address,
        schemaBlobId,
        metadataBlobId,
        privacyTier: tier,
        thresholdN: tier === PrivacyTier.Threshold ? requiredK : 0,
        thresholdM: tier === PrivacyTier.Threshold ? thresholdN : 0,
        unlockMs:
          tier === PrivacyTier.TimeLocked && unlockMs
            ? BigInt(unlockMs)
            : undefined,
        conditionalPolicyId: undefined,
        extraAdmins: [],
      });
      const sponsored = await executeSponsored({
        tx,
        sender: currentAccount.address,
        suiClient,
        dAppKit,
        waitForEffects: true,
      });

      // Real gas — sum cost fields from the executed effects (MIST → SUI).
      const cost = sponsored.effects?.gasUsed;
      if (cost) {
        const totalMist =
          BigInt(cost.computationCost ?? "0") +
          BigInt(cost.storageCost ?? "0") -
          BigInt(cost.storageRebate ?? "0");
        setActualGasSui(Number(totalMist) / 1_000_000_000);
      }

      const created = sponsored.effects?.changedObjects ?? [];
      const formChange = created.find(
        (c) => c.idOperation === "Created" && c.outputOwner?.$kind === "Shared",
      );
      const formId = formChange?.objectId ?? "";
      if (!formId) {
        setStatus({
          kind: "error",
          message: `Form created (digest ${sponsored.digest.slice(0, 12)}…) but couldn't extract Form id.`,
        });
        return;
      }
      setStatus({ kind: "done", formId });
      setDirty(false);
      setLastSavedAt(Date.now());
      setTimeout(() => router.push(`/forms/${formId}`), 1800);
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const publishing = status.kind === "running";

  return (
    <div className="echo-builder">
      <EchoNavRail active="forms" />
      <BuilderTopbar
        dirty={dirty}
        publishing={publishing}
        canPublish={canPublish}
        lastSavedAt={lastSavedAt}
        onSaveDraft={() => {
          setDirty(false);
          setLastSavedAt(Date.now());
        }}
        onPublish={handlePublish}
      />
      <div className="echo-container">
        <div className="bld-stage">
          <PalettePane onAdd={addField} />
          <CanvasPane
            title={title}
            description={description}
            fields={fields}
            selectedId={selectedId}
            onTitle={setTitle}
            onDescription={setDescription}
            onSelect={setSelectedId}
            onUpdate={updateField}
            onRemove={removeField}
            onDuplicate={duplicateField}
            onAdd={addField}
            onDragEnd={handleDragEnd}
          />
          <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {status.kind !== "idle" ? (
              <PublishProgress
                status={status}
                onCancel={() => setStatus({ kind: "idle" })}
              />
            ) : (
              <>
                <PrivacyTierPicker value={tier} onChange={setTier} />
                <GatingPanel
                  tier={tier}
                  state={gating}
                  onState={(patch) => setGating((s) => ({ ...s, ...patch }))}
                  thresholdK={thresholdK}
                  thresholdN={thresholdN}
                  onThresholdK={setThresholdK}
                  onThresholdN={setThresholdN}
                  unlockMs={unlockMs}
                  onUnlockMs={setUnlockMs}
                />
                <AIGenerator
                  value={aiPrompt}
                  onChange={setAiPrompt}
                  onGenerate={handleGenerateAI}
                  busy={aiBusy}
                />
                <OnChainSummary
                  tier={tier}
                  fieldCount={fields.length}
                  schemaBytes={schemaBytes}
                  metadataBytes={metadataBytes}
                  gasSponsor={gating.gasSponsor}
                  gasEstimateSui={gasEstimateSui}
                  packageId={packageId}
                />
                <BrutalistButton
                  size="lg"
                  className="bld-publish"
                  onClick={handlePublish}
                  disabled={!canPublish}
                >
                  sign &amp; publish on sui
                  <span style={{ fontSize: "1.1em" }}>→</span>
                </BrutalistButton>
                {!packageDeployed && (
                  <Mono size={9} color="var(--echo-warn)">
                    package id not set · publish will be blocked
                  </Mono>
                )}
                {!currentAccount && (
                  <Mono size={9} color="var(--echo-mut)">
                    connect a wallet to enable publish
                  </Mono>
                )}
              </>
            )}
          </aside>
        </div>
      </div>
      <footer
        className="echo-section"
        style={{
          background: "var(--echo-paper)",
          borderTop: "1px solid var(--echo-rail)",
        }}
      >
        <div
          className="echo-container"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBlock: 20,
          }}
        >
          <Mono size={10} color="var(--echo-mut)">
            <SuiDroplet size={10} /> echo · forms on sui
          </Mono>
          <div style={{ display: "flex", gap: 22 }}>
            <Link
              href="/dashboard"
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--echo-mut)",
                textDecoration: "none",
              }}
            >
              dashboard
            </Link>
            <Link
              href="/forms"
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--echo-mut)",
                textDecoration: "none",
              }}
            >
              my forms
            </Link>
            <Link
              href="/insights"
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 10,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--echo-mut)",
                textDecoration: "none",
              }}
            >
              insights
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
