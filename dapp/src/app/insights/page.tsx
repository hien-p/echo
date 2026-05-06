import type { Metadata } from "next";
import { InsightsConsole } from "./InsightsClient";

export const metadata: Metadata = {
  title: "Insights · Echo",
  description: "Conversational analytics over Echo submissions via Memwal.",
};

export default function InsightsPage() {
  return (
    <section className="flex flex-col gap-md max-w-[768px] mx-auto p-md w-full">
      <header>
        <h1 className="text-2xl font-semibold">Insights</h1>
        <p className="text-sm text-muted-foreground">
          Ask natural-language questions across your form submissions. Indexing
          uploads each submission to a private Memwal namespace; queries route
          through OpenRouter with the namespace memories as context.
        </p>
      </header>
      <InsightsConsole />
    </section>
  );
}
