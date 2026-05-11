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
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/api/walrus/blob/${blobId}`;
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
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const final = `![${file.name}](${imageProxyUrl(result.blobId)})`;
      // Read latest value via the ref so we don't race a typed-while-
      // uploading edit; replace this specific placeholder with the
      // final markdown.
      onChange(latestValueRef.current.replace(placeholder, final));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      onChange(latestValueRef.current.replace(placeholder, ""));
    } finally {
      setUploading(false);
    }
  };

  const onPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find((it) => it.type.startsWith("image/"));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    e.preventDefault();
    await uploadAndInsert(file);
  };

  const onDrop = async (e: React.DragEvent<HTMLTextAreaElement>) => {
    const file = Array.from(e.dataTransfer.files).find((f) =>
      f.type.startsWith("image/"),
    );
    if (!file) return;
    e.preventDefault();
    await uploadAndInsert(file);
  };

  return (
    <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-zinc-800 text-xs">
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
            label="Image (or drop / paste)"
            disabled={tab !== "edit" || uploading}
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "image/*";
              input.onchange = () => {
                const f = input.files?.[0];
                if (f) void uploadAndInsert(f);
              };
              input.click();
            }}
          >
            <ImageIcon size={14} />
          </ToolbarButton>
        </div>
        <div className="flex items-center gap-1">
          <TabButton active={tab === "edit"} onClick={() => setTab("edit")}>
            Edit
          </TabButton>
          <TabButton
            active={tab === "preview"}
            onClick={() => setTab("preview")}
          >
            Preview
          </TabButton>
        </div>
      </div>

      {tab === "edit" ? (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={onPaste}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          placeholder={
            placeholder ??
            "Write your answer in markdown.\n\n**bold**, *italic*, # heading, > quote, `code`, [link](url).\n\nDrop or paste an image and we'll upload it to Walrus, then insert ![alt](url) at your cursor."
          }
          className="w-full resize-y bg-transparent px-5 py-4 text-base leading-[1.7] text-zinc-100 placeholder:text-zinc-600 outline-none focus:placeholder:text-zinc-700"
          style={{ minHeight }}
        />
      ) : (
        <div
          className="px-5 py-4 text-base leading-[1.7] text-zinc-100 [&_p]:my-3 [&_img]:my-3 [&_img]:max-h-[420px] [&_img]:rounded-lg [&_img]:border [&_img]:border-zinc-800 [&_img]:bg-zinc-900 [&_a]:font-medium [&_a]:text-blue-400 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-blue-300 [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-700 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-zinc-300 [&_code]:rounded [&_code]:bg-zinc-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.9em] [&_code]:font-mono [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-zinc-800 [&_pre]:bg-zinc-950 [&_pre]:p-3 [&_pre]:text-sm [&_hr]:my-6 [&_hr]:border-zinc-800"
          style={{ minHeight }}
        >
          {value.trim() ? (
            <MarkdownView source={value} />
          ) : (
            <p className="text-zinc-500 text-sm italic">
              Nothing to preview yet.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-zinc-800 px-3 py-2 text-[11px] text-zinc-500">
        <span className="flex items-center gap-2">
          <span>Markdown · drop or paste images</span>
          {uploading && (
            <span className="inline-flex items-center gap-1.5 text-blue-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
              uploading to Walrus…
            </span>
          )}
        </span>
        {error && <span className="text-rose-400">{error}</span>}
      </div>
    </div>
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
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
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
