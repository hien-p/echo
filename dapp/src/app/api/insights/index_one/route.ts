import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface IndexOneRequest {
  formId: string;
  /** Plaintext flattened answers. Browser decrypts via Seal first. */
  text: string;
}

/**
 * Server-side companion to the browser-driven indexer.
 *
 * The browser does Seal decrypt locally using the user's wallet-signed
 * SessionKey, flattens answers to text, and POSTs only the resulting
 * plaintext here. The server NEVER sees ciphertext, NEVER holds a Seal
 * SessionKey, and NEVER has decrypt capability for the form. It just
 * forwards the text to Memwal under a form-derived namespace.
 *
 * This is the privacy-preserving path for AdminOnly / Threshold /
 * Conditional / non-demo TimeLocked tiers: the form owner stays the only
 * party that ever decrypts.
 */
export async function POST(request: Request) {
  const memwalKey = process.env.MEMWAL_PRIVATE_KEY;
  const memwalAccountId = process.env.MEMWAL_ACCOUNT_ID;
  const memwalServerUrl =
    process.env.MEMWAL_SERVER_URL ?? "https://relayer.dev.memwal.ai";

  if (!memwalKey || !memwalAccountId) {
    return NextResponse.json(
      {
        error:
          "Memwal not configured. Set MEMWAL_PRIVATE_KEY + MEMWAL_ACCOUNT_ID.",
      },
      { status: 500 },
    );
  }

  let body: IndexOneRequest;
  try {
    body = (await request.json()) as IndexOneRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body.formId?.startsWith("0x")) {
    return NextResponse.json(
      { error: "formId must be a Sui object id starting with 0x." },
      { status: 400 },
    );
  }
  if (typeof body.text !== "string" || !body.text.trim()) {
    return NextResponse.json(
      { error: "text must be a non-empty string." },
      { status: 400 },
    );
  }

  // Cap server-accepted text to avoid abuse — typical flattened answer set
  // is well under 4KB. Anything larger likely means the browser is dumping
  // raw payload bytes, which is exactly what this endpoint is meant to avoid.
  if (body.text.length > 16_000) {
    return NextResponse.json(
      {
        error: `text too long (${body.text.length} > 16000). Browser should flatten answers before sending.`,
      },
      { status: 413 },
    );
  }

  const { MemWal } = await import("@mysten-incubation/memwal");
  const memwal = MemWal.create({
    key: memwalKey,
    accountId: memwalAccountId,
    serverUrl: memwalServerUrl,
  });
  const namespace = `form-${body.formId.slice(2, 16)}`;

  await memwal.remember(body.text, namespace);
  return NextResponse.json({ namespace });
}
