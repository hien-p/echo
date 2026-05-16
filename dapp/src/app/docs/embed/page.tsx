import type { Metadata } from "next";

// export const runtime = "edge"; // disabled for walrus build

export const metadata: Metadata = {
  title: "Embed Echo · Docs",
  description:
    "Drop one script tag and one element to embed a Walrus-backed Echo form on any website. No API key, no SDK install.",
};

// Live testnet form used as the worked example. Public + read-only,
// safe to render from this docs page.
const DEMO_FORM_ID =
  "0x3121c7bf1d27de41aea9157c75a397c7899e5cb69cbc6d15e0a48ab9da2ac0e1";

// Truncated for the snippet so the code block doesn't wrap. The full
// id is what's actually rendered in the live preview iframe below.
const DEMO_FORM_ID_SHORT = `${DEMO_FORM_ID.slice(0, 10)}…${DEMO_FORM_ID.slice(-6)}`;

const EMBED_SNIPPET = `<div data-form-id="${DEMO_FORM_ID_SHORT}"></div>
<script src="https://echo-forms.wal.app/embed.js" defer></script>`;

const HEIGHT_SNIPPET = `<div
  data-form-id="${DEMO_FORM_ID_SHORT}"
  data-height="820"
></div>`;

type AttrRow = {
  name: string;
  type: string;
  default: string;
  required: boolean;
  description: string;
};

// Source of truth: `dapp/public/embed.js`. Only document attributes
// the script actually reads — `getAttribute("data-form-id")` and
// `getAttribute("data-height")`. No window globals are exposed.
const ATTRS: AttrRow[] = [
  {
    name: "data-form-id",
    type: "0x-prefixed hex string",
    default: "—",
    required: true,
    description:
      "Sui object id of the form to render. Must match /^0x[0-9a-f]+$/i. Anything else short-circuits the mount and prints an inline error in place of the iframe.",
  },
  {
    name: "data-height",
    type: "integer (pixels)",
    default: "640",
    required: false,
    description:
      "Minimum iframe height in pixels. The iframe width is always 100% of the host container; only the floor on height is configurable. No max-height — the iframe will grow if the form is taller than this value.",
  },
];

const IFRAME_PROPS = [
  { key: "width", value: "100% of host container" },
  { key: "border", value: "0 (radius 8px applied inline)" },
  { key: "loading", value: '"lazy"' },
  { key: "title", value: '"Echo feedback form"' },
  {
    key: "sandbox",
    value: '"allow-scripts allow-forms allow-same-origin allow-popups"',
  },
];

export default function EmbedDocsPage() {
  return (
    <div
      className="echo-dashboard"
      style={{ background: "var(--echo-paper)", color: "var(--echo-ink)" }}
    >
      <div className="echo-container">
        {/* Hero */}
        <section className="echo-section" style={{ padding: "120px 0 56px" }}>
          <span className="echo-mono" style={{ fontSize: 11, opacity: 0.7 }}>
            <span aria-hidden>◐</span> Docs · Embed
          </span>
          <h1
            style={{
              fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              fontWeight: 500,
              fontSize: "clamp(48px, 7vw, 96px)",
              letterSpacing: "-0.04em",
              lineHeight: 0.95,
              margin: "18px 0 24px",
            }}
          >
            Embed Echo on your site
          </h1>
          <p
            style={{
              fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              fontSize: 18,
              lineHeight: 1.55,
              maxWidth: 680,
              color: "var(--echo-ink)",
              opacity: 0.8,
            }}
          >
            Drop one <code className="echo-mono">&lt;script&gt;</code> tag and
            one <code className="echo-mono">&lt;div&gt;</code> into any page.
            The form renders inside a sandboxed iframe pointed at the Echo
            viewer, with submissions written straight to Walrus. No API key, no
            SDK install, no build step.
          </p>
        </section>

        {/* Minimal snippet */}
        <section className="echo-section" style={{ padding: "48px 0" }}>
          <span className="echo-mono" style={{ fontSize: 11, opacity: 0.7 }}>
            01 · Drop in
          </span>
          <h2
            style={{
              fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              fontWeight: 500,
              fontSize: 28,
              letterSpacing: "-0.02em",
              margin: "12px 0 16px",
            }}
          >
            The minimal embed
          </h2>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              maxWidth: 680,
              opacity: 0.8,
              marginBottom: 20,
            }}
          >
            Replace the <code className="echo-mono">data-form-id</code> with
            your own form&apos;s on-chain object id (the value after{" "}
            <code className="echo-mono">/forms/</code> in the Echo viewer URL).
            Order doesn&apos;t matter — the script auto-mounts every matching
            element on <code className="echo-mono">DOMContentLoaded</code>.
          </p>
          <CodeBlock language="html" code={EMBED_SNIPPET} />
        </section>

        {/* Live preview */}
        <section className="echo-section" style={{ padding: "48px 0" }}>
          <span className="echo-mono" style={{ fontSize: 11, opacity: 0.7 }}>
            02 · Live preview
          </span>
          <h2
            style={{
              fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              fontWeight: 500,
              fontSize: 28,
              letterSpacing: "-0.02em",
              margin: "12px 0 16px",
            }}
          >
            What it looks like
          </h2>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              maxWidth: 680,
              opacity: 0.8,
              marginBottom: 20,
            }}
          >
            This is a public testnet form rendered through the same iframe the
            embed script produces. Form id:{" "}
            <code
              className="echo-mono"
              style={{ fontSize: 11, wordBreak: "break-all" }}
            >
              {DEMO_FORM_ID}
            </code>
          </p>
          <div className="echo-card" style={{ overflow: "hidden", padding: 0 }}>
            <iframe
              src={`/forms/${DEMO_FORM_ID}`}
              title="Echo embed live preview"
              loading="lazy"
              sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
              style={{
                width: "100%",
                height: 600,
                border: 0,
                display: "block",
              }}
            />
          </div>
        </section>

        {/* Configuration */}
        <section className="echo-section" style={{ padding: "48px 0" }}>
          <span className="echo-mono" style={{ fontSize: 11, opacity: 0.7 }}>
            03 · Configuration
          </span>
          <h2
            style={{
              fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              fontWeight: 500,
              fontSize: 28,
              letterSpacing: "-0.02em",
              margin: "12px 0 16px",
            }}
          >
            Data attributes
          </h2>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              maxWidth: 680,
              opacity: 0.8,
              marginBottom: 24,
            }}
          >
            <code className="echo-mono">embed.js</code> reads two attributes off
            the mount element. There are no window globals, no init call, and no
            per-instance JS API — the script is fully declarative.
          </p>

          <div className="echo-card" style={{ overflow: "hidden", padding: 0 }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "var(--echo-paper-2)",
                    borderBottom: "1px solid var(--echo-rail)",
                  }}
                >
                  <Th>Attribute</Th>
                  <Th>Type</Th>
                  <Th>Default</Th>
                  <Th>Description</Th>
                </tr>
              </thead>
              <tbody>
                {ATTRS.map((row, idx) => (
                  <tr
                    key={row.name}
                    style={{
                      borderBottom:
                        idx === ATTRS.length - 1
                          ? "none"
                          : "1px solid var(--echo-rail)",
                    }}
                  >
                    <Td>
                      <code className="echo-mono" style={{ fontSize: 12 }}>
                        {row.name}
                      </code>
                      {row.required && (
                        <span
                          className="echo-mono"
                          style={{
                            fontSize: 10,
                            marginLeft: 8,
                            padding: "2px 6px",
                            border: "1px solid var(--echo-ink)",
                            borderRadius: 999,
                          }}
                        >
                          Required
                        </span>
                      )}
                    </Td>
                    <Td>
                      <span
                        className="echo-mono"
                        style={{ fontSize: 12, opacity: 0.8 }}
                      >
                        {row.type}
                      </span>
                    </Td>
                    <Td>
                      <span
                        className="echo-mono"
                        style={{ fontSize: 12, opacity: 0.8 }}
                      >
                        {row.default}
                      </span>
                    </Td>
                    <Td>{row.description}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p
            style={{
              fontSize: 13,
              lineHeight: 1.55,
              opacity: 0.7,
              marginTop: 16,
              maxWidth: 680,
            }}
          >
            Want a taller form? Set{" "}
            <code className="echo-mono">data-height</code> to any pixel value:
          </p>
          <div style={{ marginTop: 12 }}>
            <CodeBlock language="html" code={HEIGHT_SNIPPET} />
          </div>
        </section>

        {/* Iframe details */}
        <section className="echo-section" style={{ padding: "48px 0" }}>
          <span className="echo-mono" style={{ fontSize: 11, opacity: 0.7 }}>
            04 · Rendered iframe
          </span>
          <h2
            style={{
              fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              fontWeight: 500,
              fontSize: 28,
              letterSpacing: "-0.02em",
              margin: "12px 0 16px",
            }}
          >
            What the script produces
          </h2>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              maxWidth: 680,
              opacity: 0.8,
              marginBottom: 20,
            }}
          >
            The script swaps your mount element&apos;s children for a single
            iframe with these properties. Useful to know if you&apos;re styling
            the host container or auditing CSP.
          </p>
          <div className="echo-card" style={{ overflow: "hidden", padding: 0 }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              <tbody>
                {IFRAME_PROPS.map((p, idx) => (
                  <tr
                    key={p.key}
                    style={{
                      borderBottom:
                        idx === IFRAME_PROPS.length - 1
                          ? "none"
                          : "1px solid var(--echo-rail)",
                    }}
                  >
                    <Td>
                      <code className="echo-mono" style={{ fontSize: 12 }}>
                        {p.key}
                      </code>
                    </Td>
                    <Td>
                      <span
                        className="echo-mono"
                        style={{ fontSize: 12, opacity: 0.85 }}
                      >
                        {p.value}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Footer / errors */}
        <section className="echo-section" style={{ padding: "48px 0 96px" }}>
          <span className="echo-mono" style={{ fontSize: 11, opacity: 0.7 }}>
            05 · Failure mode
          </span>
          <h2
            style={{
              fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              fontWeight: 500,
              fontSize: 28,
              letterSpacing: "-0.02em",
              margin: "12px 0 16px",
            }}
          >
            When something is wrong
          </h2>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              maxWidth: 680,
              opacity: 0.8,
            }}
          >
            If <code className="echo-mono">data-form-id</code> is missing or
            isn&apos;t a valid <code className="echo-mono">0x</code>-hex string,
            the script replaces the element&apos;s text content with{" "}
            <code className="echo-mono">
              [Echo embed: missing or invalid data-form-id]
            </code>{" "}
            and exits silently. No console errors, no network requests. Check
            the value in your CMS or template if you see that string in
            production.
          </p>
        </section>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      className="echo-mono"
      style={{
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        textAlign: "left",
        padding: "14px 18px",
        opacity: 0.7,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td
      style={{
        padding: "16px 18px",
        verticalAlign: "top",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        fontSize: 14,
        lineHeight: 1.55,
        color: "var(--echo-ink)",
      }}
    >
      {children}
    </td>
  );
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  return (
    <div className="echo-card" style={{ overflow: "hidden", padding: 0 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 16px",
          borderBottom: "1px solid var(--echo-rail)",
          background: "var(--echo-paper-2)",
        }}
      >
        <span className="echo-mono" style={{ fontSize: 10, opacity: 0.7 }}>
          {language}
        </span>
      </div>
      <pre
        style={{
          margin: 0,
          padding: "18px 20px",
          overflowX: "auto",
          fontFamily:
            '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
          fontSize: 13,
          lineHeight: 1.6,
          color: "var(--echo-ink)",
          background: "transparent",
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
