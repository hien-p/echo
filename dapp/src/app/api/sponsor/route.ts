import { NextResponse } from "next/server";
import { EnokiClient } from "@mysten/enoki";

export const runtime = "edge";
export const dynamic = "force-dynamic";

interface CreateSponsorRequest {
  transactionKindBytes: string; // base64
  sender: string;
}

const ECHO_PACKAGE_ID =
  process.env.ENOKI_SPONSOR_PACKAGE_ID ??
  process.env.NEXT_PUBLIC_ECHO_PACKAGE_ID ??
  "";
// The Walrus mainnet site uses this CF Pages deployment purely as a
// sponsor proxy, but the project itself may be built for testnet
// (NEXT_PUBLIC_SUI_NETWORK=testnet). Enoki must be called with the
// network the *transaction* targets, so allow a dedicated override:
// set ENOKI_SPONSOR_NETWORK=mainnet (+ a mainnet ENOKI_PRIVATE_KEY and
// ENOKI_SPONSOR_PACKAGE_ID) without flipping the whole project.
const NETWORK = (process.env.ENOKI_SPONSOR_NETWORK ??
  process.env.NEXT_PUBLIC_SUI_NETWORK ??
  "testnet") as "testnet" | "mainnet";

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
        `${ECHO_PACKAGE_ID}::form::create_form`,
        `${ECHO_PACKAGE_ID}::form::close_form`,
        `${ECHO_PACKAGE_ID}::form::archive_form`,
        `${ECHO_PACKAGE_ID}::form::update_schema`,
        `${ECHO_PACKAGE_ID}::submission::submit`,
        `${ECHO_PACKAGE_ID}::submission::submit_anonymous`,
        `${ECHO_PACKAGE_ID}::reputation::mint`,
        `${ECHO_PACKAGE_ID}::reputation::claim_credit`,
      ],
    });
    return NextResponse.json({ bytes: result.bytes, digest: result.digest });
  } catch (err) {
    // Enoki collapses several distinct failures into HTTP 400 (bad tx
    // bytes, network not provisioned for the key, Move call target not
    // allowlisted in the Enoki portal, signature/sender issues). Surface
    // every detail we can so the real cause is visible instead of an
    // opaque "Request to Enoki API failed".
    const e = err as { message?: string; status?: unknown; cause?: unknown };
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
      err instanceof Error ? err.message : "Sponsor creation failed.";
    // Visible in `wrangler pages deployment tail` / CF function logs.
    console.error("[sponsor] Enoki createSponsoredTransaction failed", {
      network: NETWORK,
      packageId: ECHO_PACKAGE_ID,
      message,
      detail,
    });
    return NextResponse.json(
      { error: message, detail, network: NETWORK },
      { status: 502 },
    );
  }
}
