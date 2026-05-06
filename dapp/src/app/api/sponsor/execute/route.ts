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
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Sponsor execution failed.",
      },
      { status: 502 },
    );
  }
}
