import { NextResponse } from "next/server";
import { EnokiClient } from "@mysten/enoki";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface CreateSponsorRequest {
  transactionKindBytes: string; // base64
  sender: string;
}

const ECHO_PACKAGE_ID = process.env.NEXT_PUBLIC_ECHO_PACKAGE_ID ?? "";
const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet") as
  | "testnet"
  | "mainnet";

/**
 * Echo gas-sponsorship endpoint.
 *
 * Frontend posts the body of an unsigned transaction (transactionKind bytes,
 * built with onlyTransactionKind=true). We use the private Enoki API key to
 * wrap it as a sponsored transaction, restricting the allowed move call
 * targets to Echo's submission/reputation/bounty modules so the key can't be
 * abused to sponsor arbitrary calls.
 */
export async function POST(request: Request) {
  const apiKey = process.env.ENOKI_PRIVATE_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ENOKI_PRIVATE_KEY not configured on the server." },
      { status: 500 },
    );
  }
  if (!ECHO_PACKAGE_ID) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_ECHO_PACKAGE_ID not set." },
      { status: 500 },
    );
  }

  let body: CreateSponsorRequest;
  try {
    body = (await request.json()) as CreateSponsorRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body.transactionKindBytes || !body.sender?.startsWith("0x")) {
    return NextResponse.json(
      { error: "Missing transactionKindBytes or sender." },
      { status: 400 },
    );
  }

  const enoki = new EnokiClient({ apiKey });
  try {
    const result = await enoki.createSponsoredTransaction({
      network: NETWORK,
      transactionKindBytes: body.transactionKindBytes,
      sender: body.sender,
      allowedMoveCallTargets: [
        `${ECHO_PACKAGE_ID}::submission::submit`,
        `${ECHO_PACKAGE_ID}::submission::submit_anonymous`,
        `${ECHO_PACKAGE_ID}::reputation::mint`,
        `${ECHO_PACKAGE_ID}::reputation::claim_credit`,
      ],
    });
    return NextResponse.json({ bytes: result.bytes, digest: result.digest });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Sponsor creation failed.",
      },
      { status: 502 },
    );
  }
}
