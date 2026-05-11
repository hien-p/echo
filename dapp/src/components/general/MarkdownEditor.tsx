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
  minHeight = 120,
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
    <div className="border rounded flex flex-col">
      <div className="flex items-center justify-between gap-2 px-2 py-1 border-b text-xs flex-wrap">
        <div className="flex items-center gap-1">
          <ToolbarButton
            label="Bold"
            disabled={tab !== "edit"}
            onClick={() => wrapSelection("**")}
          >
            <Bold size={12} />
          </ToolbarButton>
          <ToolbarButton
            label="Italic"
            disabled={tab !== "edit"}
            onClick={() => wrapSelection("*")}
          >
            <Italic size={12} />
          </ToolbarButton>
          <ToolbarButton
            label="Link"
            disabled={tab !== "edit"}
            onClick={() => {
              const url = window.prompt("URL");
              if (!url) return;
              wrapSelection("[", `](${url})`);
            }}
          >
            <LinkIcon size={12} />
          </ToolbarButton>
          <ToolbarButton
            label="Image"
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
            <ImageIcon size={12} />
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
            "Markdown supported. **bold**, *italic*, [link](url), ![alt](image). Drop or paste images to upload to Walrus."
          }
          className="w-full px-2 py-2 outline-none resize-y bg-transparent"
          style={{ minHeight }}
        />
      ) : (
        <div
          className="p-3 text-sm leading-relaxed [&_img]:my-2 [&_img]:max-h-72 [&_img]:rounded [&_img]:border [&_img]:border-zinc-700 [&_img]:bg-zinc-900 [&_a]:underline [&_a]:text-blue-400 hover:[&_a]:text-blue-300 [&_p]:my-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:ml-6 [&_ol]:list-decimal [&_ol]:ml-6"
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

      <div className="px-2 py-1 border-t text-[10px] text-muted-foreground flex items-center justify-between gap-2">
        <span>
          Markdown · drop or paste images to upload to Walrus
          {uploading && " · uploading…"}
        </span>
        {error && <span className="text-destructive">{error}</span>}
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
        "p-1 rounded",
        disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-accent",
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
        "px-2 py-0.5 rounded",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
