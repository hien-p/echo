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
          // Constrain image size, keep alt text accessible.
          img({ src, alt }) {
            if (!src) return null;
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={typeof src === "string" ? src : undefined}
                alt={alt ?? ""}
                className="max-w-full max-h-72 my-2 rounded border"
                loading="lazy"
              />
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
