import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface QueryRequest {
  formId: string;
  question: string;
}

// Defaults to gpt-4o-mini — cheapest workable RAG model on OpenRouter.
// Override with OPENROUTER_MODEL for higher-fidelity providers.
const DEFAULT_MODEL = "openai/gpt-4o-mini";

/**
 * RAG over a form's Memwal namespace via OpenRouter.
 * - withMemWal middleware injects relevant memories into the model context.
 * - We constrain via a system prompt to only answer from the indexed memories
 *   so the LLM doesn't hallucinate beyond submission text.
 */
export async function POST(request: Request) {
  const memwalKey = process.env.MEMWAL_PRIVATE_KEY;
  const memwalAccountId = process.env.MEMWAL_ACCOUNT_ID;
  const memwalServerUrl =
    process.env.MEMWAL_SERVER_URL ?? "https://relayer.dev.memwal.ai";
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const modelId = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;

  if (!memwalKey || !memwalAccountId) {
    return NextResponse.json(
      {
        error:
          "Memwal not configured. Set MEMWAL_PRIVATE_KEY + MEMWAL_ACCOUNT_ID.",
      },
      { status: 500 },
    );
  }
  if (!openRouterKey) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY not configured." },
      { status: 500 },
    );
  }

  let body: QueryRequest;
  try {
    body = (await request.json()) as QueryRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body.formId?.startsWith("0x") || !body.question?.trim()) {
    return NextResponse.json(
      { error: "Need formId (0x…) and non-empty question." },
      { status: 400 },
    );
  }

  const { generateText } = await import("ai");
  const { withMemWal } = await import("@mysten-incubation/memwal/ai");
  const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");

  const namespace = `form-${body.formId.slice(2, 16)}`;
  const openrouter = createOpenRouter({ apiKey: openRouterKey });
  const baseModel = openrouter(modelId);
  const wrapped = withMemWal(baseModel, {
    key: memwalKey,
    accountId: memwalAccountId,
    serverUrl: memwalServerUrl,
    namespace,
    maxMemories: 8,
    autoSave: false,
  });

  try {
    const result = await generateText({
      model: wrapped,
      messages: [
        {
          role: "system",
          content: [
            "You analyze feedback submissions from an Echo form.",
            "Only answer using facts from the injected memories (each is one submission).",
            "If the memories don't answer the question, say so plainly.",
            "Cite the [submission id] tag at the start of each memory you use.",
          ].join(" "),
        },
        { role: "user", content: body.question },
      ],
    });

    return NextResponse.json({
      answer: result.text,
      tokens: result.usage,
      namespace,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
