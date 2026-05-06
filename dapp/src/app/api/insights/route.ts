import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Memwal-backed insights endpoint.
 *
 * Stub. Activation requires:
 *   1. `pnpm add @mysten/memwal ai @ai-sdk/anthropic`
 *      (Memwal peer-deps require zod ^3.23 — confirm compat with current zod ^4
 *      or scope-pin)
 *   2. CF Pages runtime secret `ANTHROPIC_API_KEY` (or other provider)
 *   3. A namespace per form, indexed from Walrus submission blobs
 *   4. Replace this 501 with the actual RAG flow
 */
export async function POST(request: Request) {
  void request;
  return NextResponse.json(
    { error: "Memwal not configured. See /insights for setup." },
    { status: 501 },
  );
}
