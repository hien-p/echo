import { NextResponse } from "next/server";

// Edge runtime — Cloudflare Pages workers (workerd) ship a recent V8 that
// supports AbortSignal.any() natively, so @mysten/seal works there even
// though Next.js's local Edge sandbox is missing it.
export const runtime = "edge";
export const dynamic = "force-dynamic";

interface QueryRequest {
  formId: string;
  question: string;
}

// Defaults to gpt-4o-mini — cheapest workable RAG model on OpenRouter.
// Override with OPENROUTER_MODEL for higher-fidelity providers.
const DEFAULT_MODEL = "openai/gpt-4o-mini";

// Memwal vector search returns up to N matches sorted by distance. For the
// demo's form scale (~3-100 submissions per form) we just pull all of them
// and inject as context — way more reliable than depending on semantic
// recall to match vague questions like "summary to me".
const MAX_MEMORIES_PER_QUERY = 50;

/**
 * RAG over a form's Memwal namespace via OpenRouter.
 *
 * Approach: bypass the `withMemWal` middleware (which does a single semantic
 * recall on the user's question and silently returns 0 memories for vague
 * prompts). Instead we run TWO recalls:
 *
 *   1. Focused: `recall(question)` — top semantic matches.
 *   2. Broad:   `recall("submission feedback answer response", 50)` — pulls
 *      essentially every memory in the namespace for small forms, since the
 *      generic terms are similar to anything submission-like.
 *
 * We dedupe by blob_id, format the merged set as a system context block,
 * and let the LLM synthesize. This means even "summary to me" gets full
 * data and the LLM stops claiming it has no access.
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
  const { MemWal } = await import("@mysten-incubation/memwal");
  const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");

  const namespace = `form-${body.formId.slice(2, 16)}`;
  const memwal = MemWal.create({
    key: memwalKey,
    accountId: memwalAccountId,
    serverUrl: memwalServerUrl,
  });

  // Pull memories from both passes in parallel.
  let memories: Array<{ blob_id: string; text: string; distance?: number }> =
    [];
  try {
    const [focused, broad] = await Promise.all([
      memwal.recall(body.question, 12, namespace).catch(() => ({
        results: [],
      })),
      memwal
        .recall(
          "submission response feedback answer comment",
          MAX_MEMORIES_PER_QUERY,
          namespace,
        )
        .catch(() => ({ results: [] })),
    ]);
    const seen = new Set<string>();
    for (const m of [...focused.results, ...broad.results]) {
      const r = m as { blob_id: string; text?: string; distance?: number };
      if (!r.text || seen.has(r.blob_id)) continue;
      seen.add(r.blob_id);
      memories.push({
        blob_id: r.blob_id,
        text: r.text,
        distance: r.distance,
      });
    }
    // Cap total memories so we stay well within gpt-4o-mini's context.
    memories = memories.slice(0, MAX_MEMORIES_PER_QUERY);
  } catch (err) {
    return NextResponse.json(
      {
        error: `Memwal recall failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 502 },
    );
  }

  if (memories.length === 0) {
    return NextResponse.json({
      answer:
        "Memwal returned no matches for this form's namespace. The index may still be propagating after the most recent re-index — wait a few seconds and try again. If submissions exist on chain but stay invisible, click 're-index' under the form selector to retry.",
      tokens: { totalTokens: 0 },
      namespace,
      memoriesUsed: 0,
    });
  }

  const contextBlock = memories
    .map(
      (m, i) =>
        `--- memory ${i + 1} (blob ${m.blob_id.slice(0, 10)}…) ---\n${m.text}`,
    )
    .join("\n\n");

  const openrouter = createOpenRouter({ apiKey: openRouterKey });
  try {
    const result = await generateText({
      model: openrouter(modelId),
      messages: [
        {
          role: "system",
          content: [
            "You analyze feedback submissions from an Echo form.",
            "The user has authority to read every submission — they are the form owner.",
            "Use the memory blocks below as your only source of truth.",
            "Quote relevant text verbatim and cite the [submission ...] tag at the start of each memory.",
            "If the memories don't answer the question, say so plainly — don't claim 'no access'.",
            "",
            "Memory blocks:",
            contextBlock,
          ].join("\n"),
        },
        { role: "user", content: body.question },
      ],
    });

    return NextResponse.json({
      answer: result.text,
      tokens: result.usage,
      namespace,
      memoriesUsed: memories.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
