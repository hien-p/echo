import type { Metadata } from "next";
import { AppShell } from "@/components/shell";
import { InsightsConsole } from "./InsightsClient";

export const metadata: Metadata = {
  title: "Insights · Echo",
  description: "Conversational analytics over Echo submissions via Memwal.",
};

export default function InsightsPage() {
  return (
    <AppShell
      kicker="Memwal RAG"
      title="Insights"
      subtitle="Ask natural-language questions across your form submissions. Indexing uploads each submission to a private Memwal namespace; queries route through OpenRouter with the namespace memories as context."
      width="narrow"
    >
      <InsightsConsole />
    </AppShell>
  );
}
