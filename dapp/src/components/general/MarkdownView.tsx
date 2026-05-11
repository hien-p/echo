"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Read-only markdown renderer for rich_text answers + previews. Supports
 * GitHub-flavored markdown (tables, strikethrough, task lists, autolinks),
 * relative `walrus://` style URLs are passed through as-is.
 *
 * Images render with max-width and rounded corners; links open in new tabs
 * with `noopener noreferrer` so a respondent can't hijack the admin's
 * session by tricking them into clicking a malicious link.
 */
export function MarkdownView({ source }: { source: string }) {
  return (
    <div className="markdown-body text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Force external links to open in new tab + safe rel.
          a({ href, children, ...rest }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-foreground hover:opacity-80"
                {...rest}
              >
                {children}
              </a>
            );
          },
          // Substack-style centered image with optional caption.
          // The img sits in a centered figure block: full panel width,
          // up to 32rem tall, generous vertical breathing room, soft
          // border. Alt text becomes a small italic caption beneath.
          // Inline styles to dodge the project's Tailwind 4 t-shirt-key
          // spacing shadowing that previously broke max-w-* / max-h-*.
          img({ src, alt }) {
            if (!src || typeof src !== "string") return null;
            // Strip file extension from caption when alt is clearly a
            // filename (e.g. "Sui_Primary-Gradient.png" → no caption)
            // — looks like noise. Real descriptive alt-text stays.
            const trimmed = (alt ?? "").trim();
            const looksLikeFilename = /\.[a-z0-9]{1,5}$/i.test(trimmed);
            const caption = trimmed && !looksLikeFilename ? trimmed : null;
            // Video hint: editor inserts ![name](url#video) for any
            // video/* upload so we can swap <img> → <video controls>
            // without needing rehype-raw / inline HTML support.
            const isVideo = /#video(?:\?|$)/i.test(src);
            const cleanSrc = src.replace(/#video$/i, "");
            return (
              <span
                style={{
                  display: "block",
                  margin: "1.25rem auto",
                  textAlign: "center",
                }}
              >
                {isVideo ? (
                  <video
                    src={cleanSrc}
                    controls
                    preload="metadata"
                    playsInline
                    style={{
                      display: "block",
                      margin: "0 auto",
                      maxWidth: "100%",
                      maxHeight: "32rem",
                      borderRadius: "0.5rem",
                      border: "1px solid rgb(39 39 42)",
                      backgroundColor: "rgb(0 0 0)",
                    }}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cleanSrc}
                    alt={alt ?? ""}
                    style={{
                      display: "block",
                      margin: "0 auto",
                      maxWidth: "100%",
                      maxHeight: "32rem",
                      borderRadius: "0.5rem",
                      border: "1px solid rgb(39 39 42)",
                      backgroundColor: "rgb(24 24 27)",
                      objectFit: "contain",
                    }}
                    loading="lazy"
                  />
                )}
                {caption && (
                  <span
                    style={{
                      display: "block",
                      marginTop: "0.5rem",
                      fontSize: "0.8125rem",
                      fontStyle: "italic",
                      color: "rgb(161 161 170)",
                    }}
                  >
                    {caption}
                  </span>
                )}
              </span>
            );
          },
          // Code blocks get a subtle bg.
          code({ children, className }) {
            const isBlock = (className ?? "").startsWith("language-");
            if (isBlock) {
              return (
                <pre className="bg-muted/40 border rounded p-2 overflow-x-auto text-xs">
                  <code className={className}>{children}</code>
                </pre>
              );
            }
            return (
              <code className="bg-muted/40 px-1 py-0.5 rounded text-[0.85em]">
                {children}
              </code>
            );
          },
          // GFM tables.
          table({ children }) {
            return (
              <div className="overflow-x-auto my-2">
                <table className="border-collapse text-xs">{children}</table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className="border px-2 py-1 bg-muted/40 text-left font-medium">
                {children}
              </th>
            );
          },
          td({ children }) {
            return <td className="border px-2 py-1 align-top">{children}</td>;
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
