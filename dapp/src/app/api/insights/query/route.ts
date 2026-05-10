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

  // Pull memories from both passes in parallel. We capture (and surface)
  // each recall's failure mode in the response — without this, a Memwal
  // server outage looks identical to "namespace empty" and the user has
  // no way to tell.
  let memories: Array<{ blob_id: string; text: string; distance?: number }> =
    [];
  const recallErrors: string[] = [];
  try {
    const [focused, broad] = await Promise.all([
      memwal.recall(body.question, 12, namespace).catch((e: unknown) => {
        recallErrors.push(
          `focused: ${e instanceof Error ? e.message : String(e)}`,
        );
        return { results: [] };
      }),
      memwal
        .recall(
          "submission response feedback answer comment",
          MAX_MEMORIES_PER_QUERY,
          namespace,
        )
        .catch((e: unknown) => {
          recallErrors.push(
            `broad: ${e instanceof Error ? e.message : String(e)}`,
          );
          return { results: [] };
        }),
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

  // Fallback: when Memwal returns no matches we re-fetch + decrypt +
  // flatten the form's submissions ourselves via the index_form route's
  // dryRun mode and feed the texts directly to the LLM. This keeps RAG
  // working when the dev Memwal relayer is queueing jobs but not
  // completing them (current state of relayer.dev.memwal.ai).
  let memoriesSource: "memwal" | "direct-decrypt" = "memwal";
  if (memories.length === 0) {
    try {
      const baseUrl = new URL(request.url);
      const dryRunUrl = `${baseUrl.protocol}//${baseUrl.host}/api/insights/index_form`;
      const fallbackResp = await fetch(dryRunUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ formId: body.formId, dryRun: true }),
      });
      if (fallbackResp.ok) {
        const data = (await fallbackResp.json()) as {
          texts?: Array<{ submissionId: string; text: string }>;
        };
        if (data.texts && data.texts.length > 0) {
          memories = data.texts.slice(0, MAX_MEMORIES_PER_QUERY).map((t) => ({
            blob_id: t.submissionId,
            text: t.text,
          }));
          memoriesSource = "direct-decrypt";
        }
      }
    } catch {
      /* fallback failed too — fall through to "no matches" response */
    }
  }

  if (memories.length === 0) {
    const detail =
      recallErrors.length > 0
        ? ` Recall errors: ${recallErrors.join("; ")}`
        : " No submissions found on chain for this form. Submit one to populate the namespace.";
    return NextResponse.json({
      answer: `Memwal returned no matches for namespace "${namespace}" and direct-decrypt fallback found nothing either.${detail}`,
      tokens: { totalTokens: 0 },
      namespace,
      memoriesUsed: 0,
      memoriesSource,
      recallErrors,
    });
  }

  const contextBlock = memories
    .map(
      (m, i) =>
        `--- memory ${i + 1} (${memoriesSource === "memwal" ? "blob" : "submission"} ${m.blob_id.slice(0, 10)}…) ---\n${m.text}`,
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
      memoriesSource,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
