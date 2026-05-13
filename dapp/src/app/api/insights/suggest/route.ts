import { NextResponse } from "next/server";

// Edge runtime so this co-locates with the rest of /api/insights/*.
export const runtime = "edge";
export const dynamic = "force-dynamic";

interface SuggestRequest {
  formId: string;
}

const DEFAULT_MODEL = "openai/gpt-4o-mini";
const SAMPLE_MEMORIES = 5;

/**
 * Generate 3 form-aware suggested questions based on a sample of the
 * form's actual submissions. Client caches these per-formId — the UI
 * renders them above the hardcoded SUGGESTIONS list under a small
 * "For this form" heading.
 *
 * Failure modes are treated as soft: any error (no submissions, Memwal
 * down, model malformed JSON) returns { suggestions: [] } and the UI
 * silently falls back to its hardcoded prompts.
 */
export async function POST(request: Request) {
  const memwalKey = process.env.MEMWAL_PRIVATE_KEY;
  const memwalAccountId = process.env.MEMWAL_ACCOUNT_ID;
  const memwalServerUrl =
    process.env.MEMWAL_SERVER_URL ?? "https://relayer.dev.memwal.ai";
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const modelId = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;

  if (!memwalKey || !memwalAccountId || !openRouterKey) {
    return NextResponse.json({ suggestions: [], source: "unconfigured" });
  }

  let body: SuggestRequest;
  try {
    body = (await request.json()) as SuggestRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body.formId?.startsWith("0x")) {
    return NextResponse.json(
      { error: "formId must start with 0x." },
      { status: 400 },
    );
  }

  const { generateObject } = await import("ai");
  const { MemWal } = await import("@mysten-incubation/memwal");
  const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
  const { z } = await import("zod");

  const namespace = `form-${body.formId.slice(2, 16)}`;
  const memwal = MemWal.create({
    key: memwalKey,
    accountId: memwalAccountId,
    serverUrl: memwalServerUrl,
  });

  // Pull a small sample. Broad query keywords match anything submission-like
  // — enough to let the LLM see what kind of feedback this form collects.
  let texts: string[] = [];
  let source: "memwal" | "direct-decrypt" | "empty" = "memwal";
  try {
    const recall = await memwal.recall(
      "submission response feedback answer comment",
      SAMPLE_MEMORIES,
      namespace,
    );
    for (const m of recall.results) {
      const r = m as { text?: string };
      if (r.text) texts.push(r.text);
    }
  } catch {
    /* fall through to dryRun fallback */
  }

  if (texts.length === 0) {
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
          texts?: Array<{ text: string }>;
        };
        texts = data.texts?.slice(0, SAMPLE_MEMORIES).map((t) => t.text) ?? [];
        if (texts.length > 0) source = "direct-decrypt";
      }
    } catch {
      /* fall through */
    }
  }

  if (texts.length === 0) {
    return NextResponse.json({ suggestions: [], source: "empty" });
  }

  const schema = z.object({
    suggestions: z
      .array(z.string().min(8).max(120))
      .min(3)
      .max(3)
      .describe(
        "Exactly 3 questions a researcher would ask of THIS data. Each ends with '?'. Specific to the form's actual content, not generic.",
      ),
  });

  const systemPrompt = [
    "You are helping a form owner explore their feedback responses.",
    "Below are real submissions from one of their forms.",
    "Generate exactly 3 short, specific questions they could ask to surface insights.",
    "Questions should be answerable from THIS data, not generic feedback prompts.",
    "Vary in angle: one summary-style, one comparison/pattern, one decision-oriented.",
    "",
    "Sample submissions:",
    texts.map((t, i) => `--- sample ${i + 1} ---\n${t}`).join("\n\n"),
  ].join("\n");

  const openrouter = createOpenRouter({ apiKey: openRouterKey });

  try {
    const result = await generateObject({
      model: openrouter(modelId),
      schema,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            "Give me 3 specific, useful questions to ask of this feedback.",
        },
      ],
    });
    return NextResponse.json({
      suggestions: result.object.suggestions,
      source,
      sampledFrom: texts.length,
    });
  } catch {
    return NextResponse.json({
      suggestions: [],
      source: "model_failed",
    });
  }
}
