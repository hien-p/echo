"use client";

import { useRef, useState } from "react";
import {
  Bold,
  Italic,
  Link as LinkIcon,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadBytesViaPublisher } from "@/lib/echo/walrus";
import { clientConfig } from "@/config/clientConfig";
import { MarkdownView } from "./MarkdownView";

/**
 * Build the URL we embed in markdown for an uploaded blob.
 *
 * Routes through our own /api/walrus/blob/<id> edge proxy instead of
 * the raw aggregator. The aggregators serve blob bytes with
 * `x-content-type-options: nosniff` and no `content-type` header, which
 * Chrome interprets as "do NOT render this in <img>" — every direct
 * embed silently failed. The proxy sniffs the magic bytes and re-emits
 * a proper image/* content-type so the markdown actually renders.
 *
 * Returns an ABSOLUTE URL (pinned to the current origin) so the
 * markdown is portable — paste the answer into a GitHub README, blog,
 * Notion page, or any other site and the embed still works because
 * the <img> can fetch back to our hosted proxy. A relative URL would
 * have resolved to whatever domain the markdown was pasted on and
 * 404'd outside Echo.
 */
function imageProxyUrl(blobId: string): string {
  // Prefer clientConfig.API_BASE_URL when it's set — on the Walrus
  // Sites deploy at echo-forms.wal.app there are no /api/* routes
  // (build-walrus.sh parks them), so the image proxy lives on the
  // Cloudflare Pages origin. Fall back to window.location.origin
  // when no remote API is configured (i.e. on the CF Pages deploy
  // itself or local dev).
  const base =
    clientConfig.API_BASE_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/api/walrus/blob/${blobId}`;
}

/**
 * Minimal markdown editor with Walrus-backed image paste/drop.
 *
 * - Plain textarea — users can type GFM markdown directly.
 * - Paste an image (clipboard) → uploads to Walrus → inserts
 *   ![alt](aggregatorUrl) at the cursor.
 * - Drop an image file onto the textarea → same flow.
 * - Toolbar buttons for bold / italic / link / image.
 * - Edit / Preview tab toggle so the user sees their formatted output.
 *
 * The output value remains a plain markdown string so the Move payload
 * stays text-only (no special encoding), and the admin viewer just
 * runs MarkdownView on it.
 */
export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  minHeight = 280,
  variant = "dark",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** `dark` keeps the legacy zinc-themed editor (admin/builder).
   *  `light` switches to the Echo paper-and-ink palette used in the
   *  fullscreen form-filler design (Frame×MemWal×Sui).  */
  variant?: "dark" | "light";
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const isLight = variant === "light";

  // Mirror the latest `value` prop into a ref so async paths (Walrus
  // upload completion) can read post-insert state instead of the
  // closure-captured value from when uploadAndInsert was first called.
  // Without this, the final-replace step ran against the pre-insert
  // value, so the placeholder we inserted at the cursor got wiped along
  // with the final markdown — the image just vanished from the editor.
  const latestValueRef = useRef(value);
  latestValueRef.current = value;

  const insertAtCursor = (text: string) => {
    const ta = ref.current;
    if (!ta) {
      onChange(value + text);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    // Restore cursor after the inserted text on next tick.
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + text.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const wrapSelection = (left: string, right: string = left) => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = value.slice(start, end);
    const next = value.slice(0, start) + left + sel + right + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + left.length, end + left.length);
    });
  };

  const uploadAndInsert = async (file: File) => {
    setError(null);
    setUploading(true);
    const placeholder = `![Uploading ${file.name}…]()`;
    insertAtCursor(placeholder);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await uploadBytesViaPublisher(bytes);
      // Both images (incl. animated GIFs) and videos use the markdown
      // image syntax `![alt](url)`. Videos get a `#video` URL fragment
      // hint so MarkdownView can swap the rendered <img> for a <video
      // controls> tag without needing rehype-raw / inline HTML support.
      // Fragments are ignored by the proxy when fetching the bytes.
      const isVideo = file.type.startsWith("video/");
      const url = imageProxyUrl(result.blobId) + (isVideo ? "#video" : "");
      const final = `![${file.name}](${url})`;
      onChange(latestValueRef.current.replace(placeholder, final));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      onChange(latestValueRef.current.replace(placeholder, ""));
    } finally {
      setUploading(false);
    }
  };

  const isUploadable = (mime: string) =>
    mime.startsWith("image/") || mime.startsWith("video/");

  const onPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const item = items.find((it) => isUploadable(it.type));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    e.preventDefault();
    await uploadAndInsert(file);
  };

  const onDrop = async (e: React.DragEvent<HTMLTextAreaElement>) => {
    setDragOver(false);
    const file = Array.from(e.dataTransfer.files).find((f) =>
      isUploadable(f.type),
    );
    if (!file) return;
    e.preventDefault();
    await uploadAndInsert(file);
  };

  // Inline upload helper used by the explicit `+ image` / `+ video`
  // buttons in light mode — wraps the same uploadAndInsert pipeline so
  // the markdown gets the proper proxy URL.
  const openFilePicker = (accept: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) void uploadAndInsert(f);
    };
    input.click();
  };

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden",
        isLight
          ? "rounded-md border-2"
          : "rounded-xl border border-zinc-800 bg-zinc-900/40",
      )}
      style={
        isLight
          ? {
              borderColor: "var(--echo-ink)",
              background: "var(--echo-paper)",
              boxShadow: "var(--echo-brut-shadow-sm)",
            }
          : undefined
      }
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 px-3 py-2 text-xs",
          isLight ? "border-b" : "border-b border-zinc-800",
        )}
        style={
          isLight
            ? {
                borderColor: "var(--echo-rail)",
                background: "var(--echo-paper-2)",
              }
            : undefined
        }
      >
        <div className="flex items-center gap-0.5">
          <ToolbarButton
            label="Bold (⌘B)"
            disabled={tab !== "edit"}
            onClick={() => wrapSelection("**")}
          >
            <Bold size={14} />
          </ToolbarButton>
          <ToolbarButton
            label="Italic (⌘I)"
            disabled={tab !== "edit"}
            onClick={() => wrapSelection("*")}
          >
            <Italic size={14} />
          </ToolbarButton>
          <span className="mx-1 h-4 w-px bg-zinc-800" />
          <ToolbarButton
            label="Heading"
            disabled={tab !== "edit"}
            onClick={() => insertAtCursor("\n## ")}
          >
            <span className="font-bold text-[13px] leading-none">H</span>
          </ToolbarButton>
          <ToolbarButton
            label="Quote"
            disabled={tab !== "edit"}
            onClick={() => insertAtCursor("\n> ")}
          >
            <span className="text-[14px] leading-none">&ldquo;</span>
          </ToolbarButton>
          <ToolbarButton
            label="List"
            disabled={tab !== "edit"}
            onClick={() => insertAtCursor("\n- ")}
          >
            <span className="text-[14px] leading-none">•</span>
          </ToolbarButton>
          <ToolbarButton
            label="Code"
            disabled={tab !== "edit"}
            onClick={() => wrapSelection("`")}
          >
            <span className="font-mono text-[12px] leading-none">{"</>"}</span>
          </ToolbarButton>
          <span className="mx-1 h-4 w-px bg-zinc-800" />
          <ToolbarButton
            label="Link"
            disabled={tab !== "edit"}
            onClick={() => {
              const url = window.prompt("URL");
              if (!url) return;
              wrapSelection("[", `](${url})`);
            }}
          >
            <LinkIcon size={14} />
          </ToolbarButton>
          <ToolbarButton
            label="Image, GIF, or video (or drop / paste)"
            disabled={tab !== "edit" || uploading}
            onClick={() => openFilePicker("image/*,video/*")}
          >
            <ImageIcon size={14} />
          </ToolbarButton>
        </div>
        <div className="flex items-center gap-1.5">
          {isLight && (
            <>
              <UploadPill
                label="image"
                disabled={tab !== "edit" || uploading}
                onClick={() => openFilePicker("image/*")}
              />
              <UploadPill
                label="video"
                disabled={tab !== "edit" || uploading}
                onClick={() => openFilePicker("video/*")}
              />
              <span
                aria-hidden="true"
                style={{
                  width: 1,
                  height: 16,
                  background: "var(--echo-rail)",
                  margin: "0 4px",
                }}
              />
            </>
          )}
          <TabButton
            active={tab === "edit"}
            onClick={() => setTab("edit")}
            variant={variant}
          >
            Edit
          </TabButton>
          <TabButton
            active={tab === "preview"}
            onClick={() => setTab("preview")}
            variant={variant}
          >
            Preview
          </TabButton>
        </div>
      </div>

      {tab === "edit" ? (
        <div className="relative">
          <textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onPaste={onPaste}
            onDrop={onDrop}
            onDragOver={(e) => {
              e.preventDefault();
              if (!dragOver) setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            placeholder={
              placeholder ??
              "Write your answer in markdown.\n\n**bold**, *italic*, # heading, > quote, `code`, [link](url).\n\nDrop or paste an image, GIF, or video — we'll upload it to Walrus and insert it at your cursor."
            }
            className={cn(
              "w-full resize-y bg-transparent px-5 py-4 text-base leading-[1.7] outline-none",
              isLight
                ? "placeholder:text-[color:var(--echo-mut-2)] focus:placeholder:text-[color:var(--echo-rail)]"
                : "text-zinc-100 placeholder:text-zinc-600 focus:placeholder:text-zinc-700",
            )}
            style={{
              minHeight,
              ...(isLight ? { color: "var(--echo-ink)" } : null),
            }}
          />
          {dragOver && (
            <div
              aria-hidden="true"
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none"
              style={{
                background: isLight
                  ? "rgba(232, 255, 117, 0.65)"
                  : "rgba(77, 162, 255, 0.18)",
                border: isLight
                  ? "2px dashed var(--echo-ink)"
                  : "2px dashed #4DA2FF",
                color: isLight ? "var(--echo-ink)" : "#DBEAFE",
                fontFamily:
                  "var(--echo-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              <span style={{ fontSize: 36 }}>＋</span>
              <span>drop to attach · stored as walrus blob</span>
            </div>
          )}
        </div>
      ) : (
        <div
          className={cn(
            "px-5 py-4 text-base leading-[1.7]",
            isLight
              ? "[&_p]:my-3 [&_img]:my-3 [&_img]:max-h-[420px] [&_img]:rounded-md [&_img]:border [&_img]:border-[color:var(--echo-rail)] [&_a]:font-medium [&_a]:text-[color:var(--echo-sui-sea)] [&_a]:underline [&_a]:underline-offset-2 [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-[color:var(--echo-rail)] [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-[color:var(--echo-mut)] [&_code]:rounded [&_code]:bg-[color:var(--echo-rail-2)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.9em] [&_code]:font-mono [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-[color:var(--echo-rail)] [&_pre]:bg-[color:var(--echo-rail-2)] [&_pre]:p-3 [&_pre]:text-sm [&_hr]:my-6 [&_hr]:border-[color:var(--echo-rail)]"
              : "text-zinc-100 [&_p]:my-3 [&_img]:my-3 [&_img]:max-h-[420px] [&_img]:rounded-lg [&_img]:border [&_img]:border-zinc-800 [&_img]:bg-zinc-900 [&_a]:font-medium [&_a]:text-blue-400 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-blue-300 [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-700 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-zinc-300 [&_code]:rounded [&_code]:bg-zinc-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.9em] [&_code]:font-mono [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-zinc-800 [&_pre]:bg-zinc-950 [&_pre]:p-3 [&_pre]:text-sm [&_hr]:my-6 [&_hr]:border-zinc-800",
          )}
          style={{
            minHeight,
            ...(isLight ? { color: "var(--echo-ink)" } : null),
          }}
        >
          {value.trim() ? (
            <MarkdownView source={value} />
          ) : (
            <p
              className="text-sm italic"
              style={{
                color: isLight ? "var(--echo-mut-2)" : undefined,
              }}
            >
              Nothing to preview yet.
            </p>
          )}
        </div>
      )}

      <div
        className={cn(
          "flex items-center justify-between gap-2 px-3 py-2 text-[11px]",
          isLight ? "border-t" : "border-t border-zinc-800 text-zinc-500",
        )}
        style={
          isLight
            ? {
                borderColor: "var(--echo-rail)",
                color: "var(--echo-mut)",
                fontFamily:
                  "var(--echo-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
                letterSpacing: "0.08em",
              }
            : undefined
        }
      >
        <span className="flex items-center gap-2">
          <span>
            <kbd
              style={{
                padding: "1px 5px",
                background: isLight ? "var(--echo-rail-2)" : undefined,
                border: isLight ? "1px solid var(--echo-rail)" : undefined,
                borderRadius: 3,
                fontSize: 10,
                marginRight: 4,
              }}
            >
              ⌘B
            </kbd>
            bold ·{" "}
            <kbd
              style={{
                padding: "1px 5px",
                background: isLight ? "var(--echo-rail-2)" : undefined,
                border: isLight ? "1px solid var(--echo-rail)" : undefined,
                borderRadius: 3,
                fontSize: 10,
                marginRight: 4,
              }}
            >
              ⌘I
            </kbd>
            italic · drop / paste files anywhere
          </span>
          {uploading && (
            <span
              className="inline-flex items-center gap-1.5"
              style={{
                color: isLight ? "var(--echo-sui-violet)" : "#60A5FA",
              }}
            >
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full"
                style={{
                  background: isLight ? "var(--echo-sui-violet)" : "#60A5FA",
                }}
              />
              uploading to walrus…
            </span>
          )}
        </span>
        {error && (
          <span style={{ color: isLight ? "#B91C1C" : undefined }}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

function UploadPill({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`Upload ${label}`}
      className="font-mono inline-flex items-center gap-1"
      style={{
        fontSize: 10,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        padding: "4px 9px",
        border: "1px solid var(--echo-ink)",
        background: "var(--echo-paper)",
        color: "var(--echo-ink)",
        borderRadius: 4,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700 }}>＋</span>
      {label}
    </button>
  );
}

function ToolbarButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-300 transition-colors",
        disabled
          ? "cursor-not-allowed opacity-30"
          : "hover:bg-zinc-800 hover:text-zinc-50",
      )}
    >
      {children}
    </button>
  );
}

function TabButton({
  children,
  active,
  onClick,
  variant = "dark",
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  variant?: "dark" | "light";
}) {
  if (variant === "light") {
    return (
      <button
        type="button"
        onClick={onClick}
        className="font-mono"
        style={{
          padding: "5px 10px",
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          border: `1px solid ${active ? "var(--echo-ink)" : "var(--echo-rail)"}`,
          background: active ? "var(--echo-ink)" : "var(--echo-paper)",
          color: active ? "var(--echo-paper)" : "var(--echo-mut)",
          borderRadius: 4,
          cursor: "pointer",
        }}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-zinc-800 text-zinc-50"
          : "text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-200",
      )}
    >
      {children}
    </button>
  );
}
