import type { Metadata } from "next";

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
          Conversational analytics, semantic search, and auto-categorization
          over Echo submissions — powered by{" "}
          <a
            href="https://www.npmjs.com/package/@mysten/memwal"
            className="underline"
          >
            @mysten/memwal
          </a>
          .
        </p>
      </header>

      <div className="border rounded p-4 bg-amber-50 dark:bg-amber-950/30 text-sm flex flex-col gap-2">
        <p className="font-medium text-amber-700 dark:text-amber-400">
          Memwal integration scaffolded; awaiting credentials.
        </p>
        <p className="text-muted-foreground">
          To activate this layer, install <code>@mysten/memwal</code> + an AI
          provider SDK (e.g. <code>ai</code> + <code>@ai-sdk/anthropic</code>),
          set <code>ANTHROPIC_API_KEY</code> as a CF Pages secret, and wire the{" "}
          <code>/api/insights</code> route to:
        </p>
        <ol className="list-decimal list-inside text-muted-foreground space-y-1">
          <li>
            Index existing Echo Walrus submission blobs into a Memwal namespace
            (form-id-scoped).
          </li>
          <li>
            Expose a <code>POST /api/insights/query</code> that takes a natural
            language question + form id, runs RAG over the namespace, and
            returns a synthesized answer plus citation submission ids.
          </li>
          <li>
            Add an <code>auto_categorize</code> sub-route that classifies
            incoming submissions (bug / feature / question / complaint).
          </li>
        </ol>
        <p className="text-muted-foreground">
          Memwal peer requirements: <code>ai &gt;= 4.0.0</code>,{" "}
          <code>zod ^3.23.0</code>, <code>@mysten/sui &gt;= 2.5.0</code>,{" "}
          <code>@mysten/seal &gt;= 1.1.0</code>,{" "}
          <code>@mysten/walrus &gt;= 1.0.3</code>. Echo currently ships Sui +
          Seal + Walrus that satisfy; <code>zod</code> is at v4 (downgrade
          required) and <code>ai</code> is not yet installed.
        </p>
      </div>

      <div className="text-xs text-muted-foreground">
        Stub route: <code>/api/insights</code> returns 501 Not Implemented.
      </div>
    </section>
  );
}
