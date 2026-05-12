import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const DEFAULT_MODEL = "openai/gpt-4o-mini";

interface GenerateRequest {
  prompt: string;
}

interface GeneratedField {
  id: string;
  type: string;
  label: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  scale?: number;
  placeholder?: string;
}

interface GeneratedForm {
  title: string;
  description: string;
  fields: GeneratedField[];
}

const SYSTEM_PROMPT = `You design forms for the Echo platform — a Walrus-native feedback tool.

Given a user's natural-language description of the feedback they want to collect, return a JSON form schema. ALWAYS respond with strict JSON only — no prose, no code fences, no markdown.

Available field types:
- "short_text"   — single-line input (≤ 120 chars)
- "long_text"    — paragraph textarea
- "rich_text"    — markdown editor with image/GIF/video drag-drop upload to Walrus
- "url"          — URL input with format validation
- "single_select"— pick one from options
- "dropdown"     — same but rendered as <select>
- "multi_select" — pick multiple from options
- "checkbox"     — boolean yes/no toggle
- "rating"       — 1..N star/number rating; include "scale" 3..10 (default 5)
- "date"         — date picker
- "time"         — time picker
- "screenshot"   — drag-drop image upload (file_upload accept image/*)
- "video"        — drag-drop video upload (file_upload accept video/*)
- "file_upload"  — generic file
- "signature"    — touch/mouse canvas pad

Rules:
- Output shape: { "title": string, "description": string, "fields": Field[] }
- Each field: { "id": kebab-case-slug, "type": one-of-above, "label": question text, "required"?: boolean }
- Choice types MUST include "options": [{ "value": "kebab-id", "label": "Display text" }, …]
- Rating MUST include "scale" (3..10)
- Aim for 3–8 well-targeted questions. Ask for screenshot or rich_text if visual context matters. Always end multi-question forms with one open-ended long_text or rich_text "anything else?" type question.
- Title is short (≤ 8 words). Description is one-sentence punchy.
- Mark a field required only if you'd genuinely block submission without it (1–3 required fields max).
- DO NOT invent field types not listed above.`;

export async function POST(request: Request) {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const modelId = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  if (!openRouterKey) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY not configured." },
      { status: 503 },
    );
  }

  let body: GenerateRequest;
  try {
    body = (await request.json()) as GenerateRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json(
      { error: "Provide a `prompt` describing the feedback you want." },
      { status: 400 },
    );
  }
  if (prompt.length > 1500) {
    return NextResponse.json(
      { error: "Prompt too long (max 1500 chars)." },
      { status: 400 },
    );
  }

  // Use OpenRouter chat completions directly — no need for the AI SDK
  // wrapper here since we want the raw JSON object back, not a stream.
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${openRouterKey}`,
      "x-title": "Echo · form generator",
    },
    body: JSON.stringify({
      model: modelId,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 1500,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return NextResponse.json(
      { error: `OpenRouter HTTP ${resp.status}`, body: text.slice(0, 200) },
      { status: 502 },
    );
  }
  const json = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content ?? "";
  if (!content) {
    return NextResponse.json(
      { error: "Model returned empty content." },
      { status: 502 },
    );
  }

  let parsed: GeneratedForm;
  try {
    parsed = JSON.parse(content) as GeneratedForm;
  } catch {
    return NextResponse.json(
      {
        error: "Model returned non-JSON. Try rephrasing.",
        raw: content.slice(0, 400),
      },
      { status: 502 },
    );
  }

  // Light validation. Strict shape; reject anything weird.
  if (!parsed.title || !Array.isArray(parsed.fields)) {
    return NextResponse.json(
      {
        error: "Generated schema missing title or fields.",
        raw: content.slice(0, 400),
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    title: String(parsed.title).slice(0, 120),
    description: String(parsed.description ?? "").slice(0, 400),
    fields: parsed.fields.map((f, i) => ({
      id: String(f.id ?? `q${i + 1}`).slice(0, 60),
      type: String(f.type ?? "short_text"),
      label: String(f.label ?? `Question ${i + 1}`).slice(0, 200),
      required: Boolean(f.required),
      ...(f.options && { options: f.options.slice(0, 12) }),
      ...(f.scale && { scale: Math.min(10, Math.max(3, Number(f.scale))) }),
      ...(f.placeholder && {
        placeholder: String(f.placeholder).slice(0, 120),
      }),
    })),
  });
}
