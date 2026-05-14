"use client";

/**
 * /forms/new — Echo Form Builder shell per
 * `~/Downloads/memwal_newversion/form-builder.jsx`.
 *
 * Wraps the existing real-data FormBuilder (drag-drop schema editor,
 * AI generate, sponsored on-chain publish) in the Frame×MemWal×Sui
 * paper-theme shell so it sits in the same surface family as
 * /dashboard, /forms, /insights, /forms/[id].
 *
 * Memory: all existing functionality stays inside FormBuilder —
 * field types, validation, ✨ AI panel, "Sign & publish" CTA, demo
 * admin gate, env warnings. This wrapper only adds the editorial
 * hero + footer + floater chrome.
 */

import Link from "next/link";
import * as React from "react";
import { motion } from "motion/react";
import { WalrusMascot, SuiDroplet } from "@/components/general/FrameForms";
import { FormBuilder } from "./FormBuilderClient";

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

function HeroShelf() {
  return (
    <section className="echo-section" style={{ background: "var(--echo-paper)" }}>
      <div
        className="echo-container"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 40,
          alignItems: "center",
          paddingBlock: "48px 56px",
        }}
      >
        <div style={{ maxWidth: 680 }}>
          <Mono size={11}>
            <span style={{ color: "var(--echo-ink)" }}>● builder</span>
            <span style={{ margin: "0 10px", color: "#D6D6D6" }}>·</span>
            schema → Walrus · form → Sui
          </Mono>
          <motion.h1
            initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
            className="echo-display"
            style={{ fontSize: "clamp(56px, 7.5vw, 110px)" }}
          >
            <span>build a form</span>
            <span
              style={{
                color: "var(--echo-sui-violet)",
                fontSize: "0.6em",
                marginLeft: 6,
                lineHeight: 0.9,
                position: "relative",
                top: 6,
              }}
            >
              .
            </span>
          </motion.h1>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 17,
              lineHeight: 1.55,
              color: "var(--echo-mut)",
              maxWidth: 560,
              margin: "0 0 16px",
            }}
          >
            Drag-drop the question types, pick a privacy tier, sign once. Schema
            and metadata land on Walrus; the Form object anchors blob IDs +
            owner cap on Sui. Gas is sponsored — respondents pay nothing.
          </p>
          <Mono size={10} color="var(--echo-mut-2)">
            <SuiDroplet size={10} /> 14 field types · 5 privacy tiers · ✨ AI
            generate
          </Mono>
        </div>
        <div
          style={{
            position: "relative",
            height: 260,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: "20px 0 20px 20px",
              borderRadius: "999px 999px 24px 24px",
              background:
                "radial-gradient(120% 80% at 70% 30%, #6FBCF0 0%, transparent 50%), radial-gradient(100% 100% at 20% 80%, #6CD3D6 0%, transparent 55%), radial-gradient(80% 100% at 90% 90%, #A06EE9 0%, transparent 60%), #FFFFFF",
            }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.0, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "relative",
              zIndex: 2,
              filter: "drop-shadow(0 24px 30px rgba(76,162,255,0.25))",
            }}
            className="ff-bobble"
          >
            <WalrusMascot pose="peace" size={210} />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function FooterRail() {
  return (
    <footer className="echo-section" style={{ background: "var(--echo-paper)" }}>
      <div
        className="echo-container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBlock: 24,
        }}
      >
        <Mono size={10} color="var(--echo-mut)">
          echo · form builder
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
              fontWeight: 500,
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
              fontWeight: 500,
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
              fontWeight: 500,
            }}
          >
            insights
          </Link>
        </div>
      </div>
    </footer>
  );
}

function Floater() {
  return (
    <Link
      href="/forms"
      aria-label="back to my forms"
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        zIndex: 30,
        border: "2px solid var(--echo-ink)",
        borderRadius: 999,
        width: 72,
        height: 72,
        background: "var(--echo-paper)",
        boxShadow: "var(--echo-brut-shadow)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
      className="ff-bobble"
    >
      <WalrusMascot pose="salute" size={72} />
    </Link>
  );
}

export function EchoFormBuilderShell() {
  return (
    <div className="echo-dashboard">
      <HeroShelf />
      <section
        className="echo-section"
        style={{ background: "var(--echo-paper-2)" }}
      >
        <div className="echo-container" style={{ paddingBlock: "32px 64px" }}>
          <div
            className="echo-card"
            style={{
              padding: "28px 32px",
              maxWidth: 1080,
              margin: "0 auto",
              background: "var(--echo-paper)",
            }}
          >
            <FormBuilder />
          </div>
        </div>
      </section>
      <FooterRail />
      <Floater />
    </div>
  );
}
