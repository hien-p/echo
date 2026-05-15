import type { Metadata } from "next";
import Link from "next/link";
import SwaggerUIClient from "./swagger-ui-client";

export const metadata: Metadata = {
  title: "Docs · Echo",
  description: "Documentation for embedding and integrating Echo.",
};

export default function DocsIndex() {
  // In development, surface the internal Swagger UI for the API routes —
  // matches the previous behavior of this page so local API exploration
  // keeps working. In production, render the public docs landing.
  if (process.env.NODE_ENV === "development") {
    return <SwaggerUIClient />;
  }

  return (
    <div
      className="echo-dashboard"
      style={{ background: "var(--echo-paper)", color: "var(--echo-ink)" }}
    >
      <div className="echo-container">
        <section className="echo-section" style={{ padding: "120px 0 64px" }}>
          <span className="echo-mono" style={{ fontSize: 11, opacity: 0.7 }}>
            <span aria-hidden>◐</span> Docs
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
            Echo documentation
          </h1>
          <p
            style={{
              fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
              fontSize: 18,
              lineHeight: 1.55,
              maxWidth: 680,
              opacity: 0.8,
            }}
          >
            Short, focused guides for getting Echo onto a real site.
          </p>
        </section>

        <section className="echo-section" style={{ padding: "48px 0 120px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 20,
            }}
          >
            <Link
              href="/docs/embed"
              className="echo-card"
              style={{
                padding: 24,
                textDecoration: "none",
                color: "var(--echo-ink)",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <span
                className="echo-mono"
                style={{ fontSize: 10, opacity: 0.7 }}
              >
                01 · Embed
              </span>
              <h2
                style={{
                  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
                  fontWeight: 500,
                  fontSize: 24,
                  letterSpacing: "-0.02em",
                  margin: 0,
                }}
              >
                Embed Echo on your site
              </h2>
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.55,
                  opacity: 0.75,
                  margin: 0,
                }}
              >
                Drop one script tag and one element. Walrus-backed, no API key,
                no SDK install.
              </p>
              <span
                className="echo-mono"
                style={{ fontSize: 11, marginTop: 8 }}
              >
                Read guide →
              </span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
