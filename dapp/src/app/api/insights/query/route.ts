import { NextResponse } from "next/server";

// Edge runtime — Cloudflare Pages workers (workerd) ship a recent V8 that
// supports AbortSignal.any() natively, so @mysten/seal works there even
// though Next.js's local Edge sandbox is missing it.
export const runtime = "edge";
export const dynamic = "force-dynamic";

interface QueryRequest {
  /** Single-form mode (back-compat). */
  formId?: string;
  /** Cross-form mode: fan-out recall across multiple namespaces, dedupe,
   *  run one LLM call over the merged context. When set, `formId` is
   *  ignored. */
  formIds?: string[];
  question: string;
  /** Date-range filter applied to memories whose [submission … ts:N …]
   *  header contains a parseable timestamp. */
  scope?: "all" | "7d" | "30d";
  /** When true, response is `text/event-stream` emitting progressive
   *  partial objects from the LLM (via AI SDK `streamObject`) followed
   *  by a `done` event with the full structured result. Single primary
   *  model only — fallback chain only runs in the non-stream path. */
  stream?: boolean;
}

const DEFAULT_MODEL = "openai/gpt-4o-mini";

const FALLBACK_MODELS = [
  "google/gemini-2.0-flash-001",
  "google/gemini-flash-1.5",
  "mistralai/mistral-small-3.1-24b-instruct",
  "anthropic/claude-3.5-haiku",
];

function isRegionBlock(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /not available in your region|geographic restriction|country not supported|unavailable in your country/i.test(
    msg,
  );
}

/**
 * Models can return malformed/unparseable JSON even when the request is fine.
 * Walk the fallback chain in that case — it's a model-capability issue, not
 * a transport error. The AI SDK throws `AI_NoObjectGeneratedError` here.
 */
function isStructuredOutputFailure(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name ?? "";
  const msg = err instanceof Error ? err.message : String(err);
  return (
    name === "AI_NoObjectGeneratedError" ||
    /no object generated|invalid_(object|json)|could not parse the response/i.test(
      msg,
    )
  );
}

const MAX_MEMORIES_PER_QUERY = 50;

// Recommendation tells the UI which empty-state CTA to render. See
// InsightAnswer.tsx for the corresponding render branches.
type Recommendation =
  | "ok"
  | "submit_to_populate"
  | "decrypt_failed"
  | "wait_for_memwal"
  | "region_blocked";

/**
 * RAG over a form's Memwal namespace via OpenRouter, returning prose AND
 * a structured `{themes, citations}` sidecar so the UI can render the
 * answer as research output (chip-row of themes, clickable citation list)
 * instead of a wall of text. Falls back to free-form prose if the model
 * can't produce a valid object after walking the fallback chain.
 *
 * Two-pass recall (focused + broad) survives vague prompts like
 * "summary to me" — see the prior incarnation of this route for history.
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
  const isCrossForm =
    Array.isArray(body.formIds) &&
    body.formIds.length > 0 &&
    body.formIds.every((id) => id?.startsWith("0x"));
  if (!isCrossForm && !body.formId?.startsWith("0x")) {
    return NextResponse.json(
      { error: "Need formId (0x…) or non-empty formIds array." },
      { status: 400 },
    );
  }
  if (!body.question?.trim()) {
    return NextResponse.json(
      { error: "Need a non-empty question." },
      { status: 400 },
    );
  }

  const { generateObject, streamObject } = await import("ai");
  const { MemWal } = await import("@mysten-incubation/memwal");
  const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
  const { z } = await import("zod");

  // Cross-form mode: fan-out across N namespaces, dedupe by parsed
  // submission_id from each memory's header (Memwal's blob_id is
  // per-namespace so it can't dedupe across forms).
  const effectiveFormIds = isCrossForm ? body.formIds! : [body.formId!];
  const namespaces = effectiveFormIds.map((id) => `form-${id.slice(2, 16)}`);
  const namespace = namespaces[0]; // representative; UI shows count when isCrossForm

  const memwal = MemWal.create({
    key: memwalKey,
    accountId: memwalAccountId,
    serverUrl: memwalServerUrl,
  });

  // Resolve human-readable titles for every form in parallel. The
  // first response field is `formTitle` (single or "N forms" composite);
  // per-form titles are also returned for the UI to render alongside
  // each citation when cross-form.
  const titlePromises = effectiveFormIds.map((id) =>
    resolveFormTitle(id).catch(() => null),
  );

  let memories: Array<{ blob_id: string; text: string; distance?: number }> =
    [];
  const recallErrors: string[] = [];
  try {
    // Each namespace gets the same two-pass recall pattern that single-
    // form mode uses. Memwal calls fan out in parallel.
    const perNamespaceRecalls = await Promise.all(
      namespaces.map((ns) =>
        Promise.all([
          memwal.recall(body.question, 12, ns).catch((e: unknown) => {
            recallErrors.push(
              `${ns} focused: ${e instanceof Error ? e.message : String(e)}`,
            );
            return { results: [] };
          }),
          memwal
            .recall(
              "submission response feedback answer comment",
              MAX_MEMORIES_PER_QUERY,
              ns,
            )
            .catch((e: unknown) => {
              recallErrors.push(
                `${ns} broad: ${e instanceof Error ? e.message : String(e)}`,
              );
              return { results: [] };
            }),
        ]),
      ),
    );
    // Dedupe across all namespaces by parsed submission_id (since
    // Memwal blob_id is per-namespace). Falls back to blob_id when the
    // text has no [submission 0x...] header.
    const seenSub = new Set<string>();
    const seenBlob = new Set<string>();
    for (const [focused, broad] of perNamespaceRecalls) {
      for (const m of [...focused.results, ...broad.results]) {
        const r = m as { blob_id: string; text?: string; distance?: number };
        if (!r.text) continue;
        const subMatch = /\[submission (0x[0-9a-f]+)/i.exec(r.text);
        const dedupeKey = subMatch
          ? `sub:${subMatch[1].toLowerCase()}`
          : `blob:${r.blob_id}`;
        if (
          subMatch
            ? seenSub.has(subMatch[1].toLowerCase())
            : seenBlob.has(r.blob_id)
        )
          continue;
        if (subMatch) seenSub.add(subMatch[1].toLowerCase());
        else seenBlob.add(r.blob_id);
        memories.push({
          blob_id: r.blob_id,
          text: r.text,
          distance: r.distance,
        });
        // dedupeKey kept for potential future telemetry — suppress unused warn
        void dedupeKey;
      }
    }
    memories = memories.slice(0, MAX_MEMORIES_PER_QUERY);
  } catch (err) {
    const formTitle = await composeTitle(titlePromises, isCrossForm);
    return NextResponse.json(
      {
        error: `Memwal recall failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
        formTitle,
        namespace,
        recommendation: "wait_for_memwal" satisfies Recommendation,
      },
      { status: 502 },
    );
  }

  // Direct-decrypt fallback: when Memwal returns nothing we re-fetch and
  // decrypt the form's submissions ourselves via index_form's dryRun mode
  // and feed the texts directly to the LLM. Also gives us the on-chain
  // event count so the empty-state can say "X submissions on chain but
  // none indexed" vs "no submissions at all".
  let memoriesSource: "memwal" | "direct-decrypt" = "memwal";
  let onChainEventCount: number | null = null;
  // Direct-decrypt fallback is single-form only — it depends on
  // index_form's dryRun mode which takes one formId. Cross-form mode
  // skips it and surfaces an empty-state if no Memwal hit.
  if (memories.length === 0 && !isCrossForm) {
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
          events?: number;
        };
        onChainEventCount = data.events ?? null;
        if (data.texts && data.texts.length > 0) {
          memories = data.texts.slice(0, MAX_MEMORIES_PER_QUERY).map((t) => ({
            blob_id: t.submissionId,
            text: t.text,
          }));
          memoriesSource = "direct-decrypt";
        }
      }
    } catch {
      /* fallback failed too — empty-state response below handles this */
    }
  }

  // Hard-filter memories by scope when timestamps are present in the
  // memory header (ts:N). Memories indexed before this convention have
  // no ts: tag and fall through unfiltered — backward compatible.
  if (body.scope && body.scope !== "all") {
    const windowMs = body.scope === "7d" ? 7 * 86400000 : 30 * 86400000;
    const cutoff = Date.now() - windowMs;
    memories = memories.filter((m) => {
      const match = /\bts:(\d+)\b/.exec(m.text);
      if (!match) return true;
      const ts = Number(match[1]);
      return Number.isFinite(ts) && ts >= cutoff;
    });
  }

  const formTitle = await composeTitle(titlePromises, isCrossForm);

  if (memories.length === 0) {
    // Pick the empty-state recommendation:
    //   events > 0 → submissions exist on-chain but couldn't be decrypted
    //                (encrypted tier + indexer missing the cap, or seal err)
    //   events === 0 → no submissions yet, share the form to get some
    //   recallErrors → Memwal relayer sick, retrying may help
    //   null → fallback itself failed, treat as Memwal sickness
    let recommendation: Recommendation;
    if (onChainEventCount === 0) {
      recommendation = "submit_to_populate";
    } else if (onChainEventCount && onChainEventCount > 0) {
      recommendation = "decrypt_failed";
    } else if (recallErrors.length > 0) {
      recommendation = "wait_for_memwal";
    } else {
      recommendation = "wait_for_memwal";
    }

    const detail =
      recallErrors.length > 0
        ? ` Recall errors: ${recallErrors.join("; ")}`
        : onChainEventCount === 0
          ? " No submissions found on chain for this form. Submit one to populate the namespace."
          : onChainEventCount && onChainEventCount > 0
            ? ` Found ${onChainEventCount} submission(s) on chain but couldn't decrypt them — the indexer may be missing a FormOwnerCap.`
            : "";
    return NextResponse.json({
      answer: `Memwal returned no matches for namespace "${namespace}" (${
        formTitle ?? effectiveFormIds[0].slice(0, 10) + "…"
      }) and direct-decrypt fallback found nothing either.${detail}`,
      tokens: { totalTokens: 0 },
      namespace,
      formTitle,
      memoriesUsed: 0,
      memoriesSource,
      onChainEventCount,
      recallErrors,
      recommendation,
    });
  }

  const contextBlock = memories
    .map(
      (m, i) =>
        `--- memory ${i + 1} (${memoriesSource === "memwal" ? "blob" : "submission"} ${m.blob_id.slice(0, 10)}…) ---\n${m.text}`,
    )
    .join("\n\n");

  const schema = z.object({
    answer: z
      .string()
      .describe(
        "Conversational prose answer, 2-5 short paragraphs. Cite submissions inline as [0xabc12345] using the short ids from the memory headers. The memories below ARE the source of truth — never claim 'no access' or 'cannot read'. If the memories don't answer the question, say so plainly.",
      ),
    confidence: z
      .enum(["high", "medium", "low"])
      .describe(
        "Your confidence the answer is supported by the data. high = many submissions converge, medium = mixed signal or thin coverage, low = the data only partially addresses the question.",
      ),
    themes: z
      .array(
        z.object({
          label: z
            .string()
            .describe("Short theme name, 1-4 words, sentence case."),
          count: z
            .number()
            .int()
            .describe(
              "How many distinct submissions express this theme (estimate).",
            ),
          sentiment: z.enum(["positive", "neutral", "negative", "mixed"]),
          citationIds: z
            .array(z.string())
            .describe(
              "Short submission ids (e.g. '0xabc12345') that exemplify this theme. Empty array if you can't pinpoint specific ones.",
            ),
        }),
      )
      .max(6)
      .describe(
        "Major themes across the submissions, ordered by importance. Empty array if the question is too narrow for themes (e.g. 'how many people said X').",
      ),
    citations: z
      .array(
        z.object({
          submissionId: z
            .string()
            .describe("Short submission id, e.g. '0xabc12345'."),
          excerpt: z
            .string()
            .describe("Verbatim quote from the memory, ~80-240 chars."),
        }),
      )
      .max(10)
      .describe(
        "Up to 10 verbatim quotes that directly support the answer. Pick the strongest evidence.",
      ),
    gaps: z
      .array(z.string())
      .max(3)
      .describe(
        "Aspects of the question that the submissions DON'T cover — gaps in the data, not the analysis. Empty array if everything was answerable. Short phrases, 4-12 words each.",
      ),
    outlier: z
      .object({
        submissionId: z.string(),
        why: z.string().describe("One sentence on what makes it unusual."),
      })
      .nullable()
      .describe(
        "A single submission that stands apart from the rest (contrary view, unusual detail, edge case). Null when nothing notable stands out.",
      ),
    personas: z
      .array(
        z.object({
          name: z
            .string()
            .describe(
              "Short persona label, 2-4 words, e.g. 'Skeptical Power User'.",
            ),
          count: z
            .number()
            .int()
            .describe("How many submissions cluster into this persona."),
          characteristic: z
            .string()
            .describe(
              "One sentence describing how this persona typically responds.",
            ),
          sentimentSlant: z.enum(["positive", "neutral", "negative", "mixed"]),
        }),
      )
      .max(4)
      .describe(
        "Up to 4 distinct persona clusters inferred from response patterns. Empty array if respondents are too homogeneous to cluster meaningfully.",
      ),
    headlineQuote: z
      .object({
        text: z
          .string()
          .describe(
            "A single short, striking verbatim quote from a submission (≤180 chars, no surrounding commentary).",
          ),
        submissionId: z
          .string()
          .describe("Short submission id this quote came from."),
      })
      .nullable()
      .describe(
        "The single most quotable line from the submissions — the one you'd put on a slide. Null when nothing reads as a quote.",
      ),
    submissionTags: z
      .array(
        z.object({
          submissionId: z.string(),
          tags: z
            .array(z.string())
            .min(1)
            .max(3)
            .describe(
              "1-3 short tags categorising this submission (e.g. 'pricing', 'onboarding-friction', 'feature-request').",
            ),
        }),
      )
      .max(20)
      .describe(
        "Auto-assigned tags per cited submission. Lowercase kebab-case, 1-3 words each. Lets the UI offer free filtering pivots.",
      ),
  });

  const scopeHint =
    body.scope === "7d"
      ? "Focus on the most recent submissions (last ~7 days) when dates are inferable from content. Note in your answer if the data window is too short."
      : body.scope === "30d"
        ? "Focus on the most recent submissions (last ~30 days) when dates are inferable from content."
        : null;

  const systemPrompt = [
    "You analyze feedback submissions from an Echo form.",
    `Form: ${formTitle ?? effectiveFormIds[0].slice(0, 10) + "…"}`,
    "The user has authority to read every submission — they are the form owner.",
    "Use the memory blocks below as your only source of truth.",
    "Quote relevant text verbatim and cite the short [0xabc…] id from the memory header.",
    "If the memories don't answer the question, say so plainly — don't claim 'no access'.",
    scopeHint ? `Scope: ${scopeHint}` : "",
    "",
    "Memory blocks:",
    contextBlock,
  ]
    .filter(Boolean)
    .join("\n");

  const openrouter = createOpenRouter({ apiKey: openRouterKey });
  const candidates = [modelId, ...FALLBACK_MODELS.filter((m) => m !== modelId)];

  // ─── Streaming branch ────────────────────────────────────────────
  // When the client opted into stream:true, switch to streamObject and
  // emit SSE events. Single primary model only — the fallback chain is
  // hard to walk mid-stream and most failures we'd recover from are
  // pre-stream (auth, region block) so the client can retry without
  // streaming and benefit from the chain on the second attempt.
  if (body.stream) {
    const memoriesPayload = memories.map((m) => ({
      submissionId: m.blob_id,
      text: m.text,
    }));
    return new Response(
      buildAnswerStream({
        model: openrouter(modelId),
        schema,
        systemPrompt,
        question: body.question,
        streamObject,
        finalMeta: {
          namespace,
          formTitle,
          memoriesUsed: memories.length,
          memoriesSource,
          modelUsed: modelId,
          memories: memoriesPayload,
        },
      }),
      {
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
        },
      },
    );
  }

  let lastErr: unknown = null;
  for (const m of candidates) {
    try {
      const result = await generateObject({
        model: openrouter(m),
        schema,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: body.question },
        ],
      });
      return NextResponse.json({
        answer: result.object.answer,
        structured: {
          themes: result.object.themes,
          citations: result.object.citations,
          confidence: result.object.confidence,
          gaps: result.object.gaps,
          outlier: result.object.outlier,
          personas: result.object.personas,
          headlineQuote: result.object.headlineQuote,
          submissionTags: result.object.submissionTags,
        },
        // Full memory texts shipped so the client can render a citation
        // deep-view sheet without a second round-trip. The user is the
        // form owner — they're already authorised to read every
        // submission, so re-shipping the plaintext is privacy-neutral.
        memories: memories.map((m) => ({
          submissionId: m.blob_id,
          text: m.text,
        })),
        tokens: result.usage,
        namespace,
        formTitle,
        memoriesUsed: memories.length,
        memoriesSource,
        modelUsed: m,
        recommendation: "ok" satisfies Recommendation,
      });
    } catch (err) {
      lastErr = err;
      // Walk the chain only when the failure is model-specific:
      // region blocks (transport-level) and JSON failures (capability).
      if (!isRegionBlock(err) && !isStructuredOutputFailure(err)) break;
    }
  }
  return NextResponse.json(
    {
      error:
        lastErr instanceof Error
          ? lastErr.message
          : String(lastErr ?? "unknown"),
      formTitle,
      namespace,
      recommendation: (isRegionBlock(lastErr)
        ? "region_blocked"
        : "wait_for_memwal") satisfies Recommendation,
      hint: isRegionBlock(lastErr)
        ? "All tried OpenRouter models are region-blocked for this account. Set OPENROUTER_MODEL to a globally-available provider (e.g. google/gemini-2.0-flash-001) or route via a VPN."
        : undefined,
    },
    { status: 502 },
  );
}

/**
 * Read the form's on-chain metadata and resolve its Walrus-stored title.
 * Plain JSON-RPC + fetch so we don't drag in @mysten/sui's full SDK on
 * the edge runtime (mirrors how index_form does jsonRpcQueryEvents).
 */
/**
 * Resolve the user-facing title for the response header. Single-form
 * mode returns the form's title; cross-form mode returns a composite
 * label like "3 forms" (the per-form titles still travel separately in
 * the per-citation metadata).
 */
async function composeTitle(
  titlePromises: Array<Promise<string | null>>,
  isCrossForm: boolean,
): Promise<string | null> {
  if (!isCrossForm) {
    return titlePromises[0] ?? null;
  }
  const titles = await Promise.all(titlePromises);
  const named = titles.filter((t): t is string => !!t);
  if (named.length === 0) return `${titles.length} forms`;
  if (named.length === titles.length && titles.length <= 3) {
    return named.join(" · ");
  }
  return `${titles.length} forms (${named.slice(0, 2).join(", ")}${
    named.length > 2 ? "…" : ""
  })`;
}

async function resolveFormTitle(formId: string): Promise<string | null> {
  const fullnode = process.env.NEXT_PUBLIC_SUI_FULLNODE_URL ?? "";
  if (!fullnode) return null;

  const objResp = await fetch(fullnode, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sui_getObject",
      params: [formId, { showContent: true }],
    }),
    cache: "no-store",
  });
  if (!objResp.ok) return null;
  const obj = (await objResp.json()) as {
    result?: {
      data?: {
        content?: { fields?: { metadata_blob_id?: string } };
      };
    };
  };
  const blobId = obj.result?.data?.content?.fields?.metadata_blob_id;
  if (!blobId) return null;

  const network = (process.env.NEXT_PUBLIC_WALRUS_NETWORK ?? "testnet") as
    | "testnet"
    | "mainnet";
  const aggregators =
    network === "mainnet"
      ? [
          "https://aggregator.walrus.atalma.io",
          "https://walrus-mainnet-aggregator.nodes.guru",
        ]
      : [
          "https://aggregator.walrus-testnet.walrus.space",
          "https://wal-aggregator-testnet.staketab.org",
        ];

  for (const base of aggregators) {
    try {
      const r = await fetch(`${base}/v1/blobs/${blobId}`);
      if (!r.ok) continue;
      const meta = (await r.json()) as { title?: string };
      if (meta.title) return meta.title;
    } catch {
      /* try next aggregator */
    }
  }
  return null;
}

/**
 * Wrap an AI SDK `streamObject` call in a ReadableStream of SSE events.
 *
 *   data: {"event":"partial","object":{...incrementally-built object...}}
 *   ...
 *   data: {"event":"done","answer":"...","structured":{...},...finalMeta}
 *
 * On stream errors we emit a single `error` event then close so the
 * client can render an empty-state card without hanging on the fetch.
 *
 * Single-model only — the non-stream branch retains the full fallback
 * chain. If the primary model fails before any chunk is sent, the
 * client falls back to a non-stream retry with `stream: false`.
 */
function buildAnswerStream(args: {
  // ai SDK provider types are intentionally loose here — keeping a
  // structural shape avoids dragging the entire `ai` package surface
  // into this file's typing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any;
  systemPrompt: string;
  question: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  streamObject: any;
  finalMeta: {
    namespace: string;
    formTitle: string | null;
    memoriesUsed: number;
    memoriesSource: "memwal" | "direct-decrypt";
    modelUsed: string;
    memories: Array<{ submissionId: string; text: string }>;
  };
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(obj)}\n\n`),
          );
        } catch {
          /* controller closed — client disconnected */
        }
      };

      try {
        const result = args.streamObject({
          model: args.model,
          schema: args.schema,
          messages: [
            { role: "system", content: args.systemPrompt },
            { role: "user", content: args.question },
          ],
        });

        // Stream each partial snapshot. The SDK yields the cumulative
        // object, so the client can just replace its `streamingPartial`
        // state with the latest payload — no diffing required.
        for await (const partial of result.partialObjectStream) {
          send({ event: "partial", object: partial });
        }

        const finalObject = await result.object;
        const usage = await result.usage.catch(() => undefined);

        send({
          event: "done",
          answer: finalObject.answer,
          structured: {
            themes: finalObject.themes,
            citations: finalObject.citations,
            confidence: finalObject.confidence,
            gaps: finalObject.gaps,
            outlier: finalObject.outlier,
            personas: finalObject.personas,
            headlineQuote: finalObject.headlineQuote,
            submissionTags: finalObject.submissionTags,
          },
          tokens: usage,
          recommendation: "ok",
          ...args.finalMeta,
        });
      } catch (err) {
        send({
          event: "error",
          message: err instanceof Error ? err.message : String(err),
          recommendation: "wait_for_memwal",
          formTitle: args.finalMeta.formTitle,
          namespace: args.finalMeta.namespace,
        });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });
}
