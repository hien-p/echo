import type { Metadata } from "next";
import { EchoInsightsRedesign } from "./EchoInsightsRedesign";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Insights · Echo",
  description: "Conversational analytics over Echo submissions via Memwal.",
};

/**
 * /insights — Echo redesign per `~/Downloads/web_memwal/insights.jsx`.
 * Wraps the existing real-RAG InsightsConsole in the Frame×MemWal×Sui
 * shell (hero with magazine prompt, side-rail index status, template
 * band) without breaking the working chat pipeline.
 */
export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q } = await searchParams;
  const initialQuestion = Array.isArray(q) ? q[0] : q;
  return <EchoInsightsRedesign initialQuestion={initialQuestion} />;
}
