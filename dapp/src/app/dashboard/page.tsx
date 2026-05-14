import type { Metadata } from "next";
import { EchoDashboardRedesign } from "./EchoRedesign";

export const metadata: Metadata = {
  title: "Dashboard · Echo",
  description:
    "Triage queue across every form you own — Frame × MemWal × Sui fusion.",
};

export const runtime = "edge";

/**
 * /dashboard — Echo redesign per Claude Design handoff
 * (~/Downloads/website-memwal/). Bypasses the prior AppShell + dark
 * EditorialHero composition so the new editorial layout (compact hero
 * + magazine KPI strip + promoted triage queue + ask-RAG rail) owns
 * the entire viewport. The old DashboardHero / BentoDashboard /
 * CrossFormDashboard / DashboardKpiStrip components are still in the
 * repo but no longer rendered here until follow-up wiring lands real
 * TanStack data into the new sections.
 */
export default function DashboardPage() {
  return <EchoDashboardRedesign />;
}
