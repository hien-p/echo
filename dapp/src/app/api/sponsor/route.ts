import { NextResponse } from "next/server";
import { EnokiClient } from "@mysten/enoki";
import { contentLengthExceeds, rateLimit } from "@/lib/server/rateLimit";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 512_000;
const MAX_TX_KIND_BYTES_B64 = 256_000;

interface CreateSponsorRequest {
  transactionKindBytes: string; // base64
  sender: string;
  /** The form's own Echo package id (derived client-side from the form's
   *  on-chain `0x<pkg>::form::Form` type). Lets the allowlist match forms
   *  created by any Echo package version, not just the configured one. */
  packageId?: string;
}

/**
 * Echo gas-sponsorship endpoint.
 *
 * Frontend posts the body of an unsigned transaction (transactionKind bytes,
 * built with onlyTransactionKind=true). We use the private Enoki API key to
 * wrap it as a sponsored transaction, restricting the allowed move call
 * targets to Echo's submission/reputation/bounty modules so the key can't be
 * abused to sponsor arbitrary calls.
 *
 * NOTE: every env read MUST be inside this handler. On the Cloudflare
 * Pages (`next-on-pages`) edge runtime, non-`NEXT_PUBLIC_` vars are bound
 * per-request, not at module init — reading them at module scope yields
 * `undefined` and silently falls back to the build-inlined NEXT_PUBLIC_*
 * value (which is why ENOKI_SPONSOR_NETWORK was being ignored and the
 * route kept calling Enoki with "testnet").
 */
export async function POST(request: Request) {
  const limited = rateLimit({
    key: "sponsor:create",
    limit: 60,
    request,
    windowMs: 10 * 60 * 1000,
  });
  if (limited) return limited;
  if (contentLengthExceeds(request, MAX_BODY_BYTES)) {
    return NextResponse.json(
      { error: "Request body too large." },
      { status: 413 },
    );
  }

  const apiKey = process.env.ENOKI_PRIVATE_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ENOKI_PRIVATE_KEY not configured on the server." },
      { status: 500 },
    );
  }
  // The Walrus mainnet site uses this CF Pages deployment purely as a
  // sponsor proxy, but the project itself may be built for testnet
  // (NEXT_PUBLIC_SUI_NETWORK=testnet). Enoki must be called with the
  // network the *transaction* targets, so allow a dedicated override:
  // set ENOKI_SPONSOR_NETWORK=mainnet (+ a mainnet ENOKI_PRIVATE_KEY and
  // ENOKI_SPONSOR_PACKAGE_ID) without flipping the whole project.
  const ECHO_PACKAGE_ID =
    process.env.ENOKI_SPONSOR_PACKAGE_ID ??
    process.env.NEXT_PUBLIC_ECHO_PACKAGE_ID ??
    "";
  const NETWORK = (process.env.ENOKI_SPONSOR_NETWORK ??
    process.env.NEXT_PUBLIC_SUI_NETWORK ??
    "testnet") as "testnet" | "mainnet";
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
  if (
    !body.transactionKindBytes ||
    body.transactionKindBytes.length > MAX_TX_KIND_BYTES_B64 ||
    !/^0x[0-9a-fA-F]{1,64}$/.test(body.sender ?? "")
  ) {
    return NextResponse.json(
      { error: "Missing or invalid transactionKindBytes or sender." },
      { status: 400 },
    );
  }

  // Allowlist the specific Echo functions for the configured package AND
  // (if the client supplied one) the form's own package. Forms are bound
  // to the package that created them, so a form from an older Echo
  // deployment must be sponsored against THAT package's functions. Still
  // restricted to these exact function names — never an arbitrary call.
  const ECHO_FNS = [
    "form::create_form",
    "form::close_form",
    "form::archive_form",
    "form::update_schema",
    "submission::submit",
    "submission::submit_anonymous",
    "reputation::mint",
    "reputation::claim_credit",
  ];
  const pkgs = new Set<string>([ECHO_PACKAGE_ID]);
  if (
    typeof body.packageId === "string" &&
    /^0x[0-9a-fA-F]{1,64}$/.test(body.packageId)
  ) {
    pkgs.add(body.packageId);
  }
  const allowedMoveCallTargets = Array.from(pkgs).flatMap((p) =>
    ECHO_FNS.map((fn) => `${p}::${fn}`),
  );

  const enoki = new EnokiClient({ apiKey });
  try {
    const result = await enoki.createSponsoredTransaction({
      network: NETWORK,
      transactionKindBytes: body.transactionKindBytes,
      sender: body.sender,
      allowedMoveCallTargets,
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
