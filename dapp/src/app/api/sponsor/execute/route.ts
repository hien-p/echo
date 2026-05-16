import { NextResponse } from "next/server";
import { EnokiClient } from "@mysten/enoki";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface ExecuteSponsorRequest {
  digest: string;
  signature: string;
}

export async function POST(request: Request) {
  const apiKey = process.env.ENOKI_PRIVATE_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ENOKI_PRIVATE_KEY not configured on the server." },
      { status: 500 },
    );
  }
  let body: ExecuteSponsorRequest;
  try {
    body = (await request.json()) as ExecuteSponsorRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body.digest || !body.signature) {
    return NextResponse.json(
      { error: "Missing digest or signature." },
      { status: 400 },
    );
  }

  const enoki = new EnokiClient({ apiKey });
  try {
    const result = await enoki.executeSponsoredTransaction({
      digest: body.digest,
      signature: body.signature,
    });
    return NextResponse.json({ digest: result.digest });
  } catch (err) {
    const e = err as { status?: unknown; cause?: unknown };
    let detail: string | undefined;
    if (e?.cause != null) {
      try {
        detail =
          typeof e.cause === "string" ? e.cause : JSON.stringify(e.cause);
      } catch {
        detail = String(e.cause);
      }
    } else if (e?.status != null) {
      detail = `status ${String(e.status)}`;
    }
    const message =
      err instanceof Error ? err.message : "Sponsor execution failed.";
    console.error("[sponsor/execute] Enoki executeSponsoredTransaction failed", {
      message,
      detail,
    });
    return NextResponse.json({ error: message, detail }, { status: 502 });
  }
}
