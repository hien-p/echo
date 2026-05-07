import { NextResponse } from "next/server";

// Node runtime — @mysten/seal needs AbortSignal.any() and crypto APIs that
// aren't reliably available in the Edge runtime sandbox.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PACKAGE_ID = process.env.NEXT_PUBLIC_ECHO_PACKAGE_ID ?? "";
const SUI_FULLNODE = process.env.NEXT_PUBLIC_SUI_FULLNODE_URL ?? "";
const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet") as
  | "testnet"
  | "mainnet"
  | "devnet";
const WALRUS_NETWORK = (process.env.NEXT_PUBLIC_WALRUS_NETWORK ?? "testnet") as
  | "testnet"
  | "mainnet";
const DEMO_ADMIN_ADDRESS = process.env.NEXT_PUBLIC_DEMO_ADMIN_ADDRESS ?? "";

const PRIVACY_PUBLIC = 0;
const PRIVACY_ADMIN_ONLY = 1;
const PRIVACY_THRESHOLD = 2;
const PRIVACY_TIME_LOCKED = 3;
const PRIVACY_CONDITIONAL = 4;

interface OnChainForm {
  schema_blob_id: string;
  metadata_blob_id: string;
  owner: string;
  privacy_tier: number;
  status: number;
  submission_count: string;
  unlock_ms?: string;
}

interface SubmissionMadeEvent {
  form_id: string;
  submission_id: string;
  submitter: string;
  schema_version: string;
  anonymous: boolean;
}

interface ListBody {
  formId: string;
}
interface DecryptBody {
  formId: string;
  submissionId: string;
  payloadBlobId: string;
}

/**
 * Demo-mode admin endpoints. Server holds DEMO_ADMIN_SECRET_KEY (== the demo
 * address that owns FormOwnerCaps for showcase forms) and signs Seal
 * SessionKey personalMessages. Only forms whose `owner` field matches
 * NEXT_PUBLIC_DEMO_ADMIN_ADDRESS are eligible — anything else is rejected
 * up front so we never expose decrypt for caps we shouldn't be holding.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ slug?: string[] }> },
) {
  const { slug } = await ctx.params;
  const action = slug?.[0];
  if (action !== "list" && action !== "decrypt") {
    return NextResponse.json(
      { error: `Unknown action ${action}. Expected list | decrypt.` },
      { status: 404 },
    );
  }

  const adminSecret = process.env.DEMO_ADMIN_SECRET_KEY;
  if (!adminSecret || !DEMO_ADMIN_ADDRESS) {
    return NextResponse.json(
      {
        error:
          "Demo admin mode disabled. Set NEXT_PUBLIC_DEMO_ADMIN_ADDRESS + DEMO_ADMIN_SECRET_KEY.",
      },
      { status: 503 },
    );
  }
  if (!PACKAGE_ID || !SUI_FULLNODE) {
    return NextResponse.json(
      {
        error:
          "NEXT_PUBLIC_ECHO_PACKAGE_ID or NEXT_PUBLIC_SUI_FULLNODE_URL missing.",
      },
      { status: 500 },
    );
  }

  let body: ListBody | DecryptBody;
  try {
    body = (await request.json()) as ListBody | DecryptBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body.formId?.startsWith("0x")) {
    return NextResponse.json(
      { error: "formId must be a Sui object id starting with 0x." },
      { status: 400 },
    );
  }

  const { SuiGrpcClient } = await import("@mysten/sui/grpc");
  const suiClient = new SuiGrpcClient({
    network: SUI_NETWORK,
    baseUrl: SUI_FULLNODE,
  });

  const formObj = await suiClient.getObject({
    objectId: body.formId,
    include: { json: true },
  });
  const onChain = formObj.object.json as OnChainForm | null;
  if (!onChain) {
    return NextResponse.json({ error: "Form not found." }, { status: 404 });
  }
  if (onChain.owner.toLowerCase() !== DEMO_ADMIN_ADDRESS.toLowerCase()) {
    return NextResponse.json(
      {
        error:
          "Form owner is not the demo admin. This endpoint only serves demo-owned forms.",
      },
      { status: 403 },
    );
  }

  if (action === "list") {
    return handleList(body.formId, suiClient);
  }

  // action === "decrypt"
  const dbody = body as DecryptBody;
  if (!dbody.submissionId?.startsWith("0x") || !dbody.payloadBlobId) {
    return NextResponse.json(
      { error: "submissionId + payloadBlobId required for decrypt." },
      { status: 400 },
    );
  }
  return handleDecrypt({
    suiClient,
    formId: dbody.formId,
    submissionId: dbody.submissionId,
    payloadBlobId: dbody.payloadBlobId,
    onChain,
    adminSecret,
  });
}

async function handleList(
  formId: string,
  suiClient: import("@mysten/sui/grpc").SuiGrpcClient,
): Promise<NextResponse> {
  const eventType = `${PACKAGE_ID}::submission::SubmissionMade`;
  const events = await jsonRpcQueryEvents(SUI_FULLNODE, eventType);
  const matching = events.filter((e) => e.form_id === formId);

  const rows = await Promise.all(
    matching.map(async (e) => {
      const subResp = await suiClient.getObject({
        objectId: e.submission_id,
        include: { json: true },
      });
      const sub = subResp.object.json as {
        payload_blob_id: string;
        submitted_ms: string;
      } | null;
      return {
        submissionId: e.submission_id,
        submitter: e.submitter,
        anonymous: e.anonymous,
        submittedAt: sub
          ? new Date(Number(sub.submitted_ms)).toISOString()
          : "(unknown)",
        payloadBlobId: sub?.payload_blob_id ?? "",
      };
    }),
  );

  return NextResponse.json({ submissions: rows });
}

async function handleDecrypt(args: {
  suiClient: import("@mysten/sui/grpc").SuiGrpcClient;
  formId: string;
  submissionId: string;
  payloadBlobId: string;
  onChain: OnChainForm;
  adminSecret: string;
}): Promise<NextResponse> {
  const { suiClient, formId, payloadBlobId, onChain, adminSecret } = args;
  const tier = onChain.privacy_tier;
  if (tier === PRIVACY_PUBLIC) {
    return NextResponse.json(
      { error: "Public forms don't need server-side decrypt." },
      { status: 400 },
    );
  }

  const sealServersRaw = process.env.NEXT_PUBLIC_SEAL_KEY_SERVERS ?? "";
  let serverConfigs: { objectId: string; weight: number }[] = [];
  try {
    const arr = JSON.parse(sealServersRaw) as Array<{
      objectId: string;
      weight?: number;
    }>;
    serverConfigs = arr.map((s) => ({
      objectId: s.objectId,
      weight: s.weight ?? 1,
    }));
  } catch {
    /* empty */
  }
  if (serverConfigs.length === 0) {
    return NextResponse.json(
      {
        error:
          "NEXT_PUBLIC_SEAL_KEY_SERVERS not set; can't fetch decrypt keys.",
      },
      { status: 500 },
    );
  }

  const [
    { SealClient, SessionKey },
    { Ed25519Keypair },
    { Transaction },
    { fromBase64, SUI_CLOCK_OBJECT_ID },
  ] = await Promise.all([
    import("@mysten/seal"),
    import("@mysten/sui/keypairs/ed25519"),
    import("@mysten/sui/transactions"),
    import("@mysten/sui/utils"),
  ]);

  const adminKeypair = Ed25519Keypair.fromSecretKey(
    fromBase64(adminSecret).slice(1),
  );
  const adminAddress = adminKeypair.getPublicKey().toSuiAddress();
  if (adminAddress.toLowerCase() !== DEMO_ADMIN_ADDRESS.toLowerCase()) {
    return NextResponse.json(
      {
        error:
          "DEMO_ADMIN_SECRET_KEY does not derive NEXT_PUBLIC_DEMO_ADMIN_ADDRESS.",
      },
      { status: 500 },
    );
  }

  // For non-TimeLocked tiers we need the FormOwnerCap object id. The cap is
  // owned by adminAddress (post-transferDemoCaps). Look it up.
  let formOwnerCapId: string | null = null;
  if (
    tier === PRIVACY_ADMIN_ONLY ||
    tier === PRIVACY_THRESHOLD ||
    tier === PRIVACY_CONDITIONAL
  ) {
    const owned = await suiClient.listOwnedObjects({
      owner: adminAddress,
      type: `${PACKAGE_ID}::form::FormOwnerCap`,
      include: { json: true },
      limit: 200,
    });
    const match = (
      owned.objects as unknown as Array<{
        objectId: string;
        json: { form_id: string };
      }>
    ).find((c) => c.json?.form_id === formId);
    formOwnerCapId = match?.objectId ?? null;
    if (!formOwnerCapId) {
      return NextResponse.json(
        {
          error:
            "Demo admin does not hold a FormOwnerCap for this form. Run transferDemoCaps first.",
        },
        { status: 412 },
      );
    }
  }

  // TimeLocked: enforce unlock window before we even ask Seal.
  const unlockMs = onChain.unlock_ms ? Number(onChain.unlock_ms) : 0;
  if (tier === PRIVACY_TIME_LOCKED && Date.now() < unlockMs) {
    return NextResponse.json(
      {
        error: `TimeLocked form not yet unlocked (unlock_ms=${unlockMs}).`,
      },
      { status: 412 },
    );
  }

  const identity = buildTierIdentity({
    formId,
    tier,
    unlockMs: BigInt(unlockMs),
  });

  const tx = new Transaction();
  const idArg = tx.pure.vector("u8", Array.from(identity));
  switch (tier) {
    case PRIVACY_ADMIN_ONLY:
      tx.moveCall({
        target: `${PACKAGE_ID}::form::seal_approve_admin_only`,
        arguments: [idArg, tx.object(formId), tx.object(formOwnerCapId!)],
      });
      break;
    case PRIVACY_THRESHOLD:
      tx.moveCall({
        target: `${PACKAGE_ID}::form::seal_approve_threshold`,
        arguments: [idArg, tx.object(formId), tx.object(formOwnerCapId!)],
      });
      break;
    case PRIVACY_TIME_LOCKED:
      tx.moveCall({
        target: `${PACKAGE_ID}::form::seal_approve_time_locked`,
        arguments: [idArg, tx.object(formId), tx.object(SUI_CLOCK_OBJECT_ID)],
      });
      break;
    case PRIVACY_CONDITIONAL:
      tx.moveCall({
        target: `${PACKAGE_ID}::form::seal_approve_conditional`,
        arguments: [idArg, tx.object(formId), tx.object(formOwnerCapId!)],
      });
      break;
    default:
      return NextResponse.json(
        { error: `Unknown privacy tier ${tier}.` },
        { status: 400 },
      );
  }

  // Sender must own the FormOwnerCap referenced in the PTB. Even with
  // onlyTransactionKind: true the SDK's pre-flight ownership check fires.
  tx.setSender(adminAddress);
  const txBytes = await tx.build({
    client: suiClient,
    onlyTransactionKind: true,
  });

  const seal = new SealClient({
    suiClient: suiClient as unknown as ConstructorParameters<
      typeof SealClient
    >[0]["suiClient"],
    serverConfigs,
    verifyKeyServers: false,
  });
  const session = await SessionKey.create({
    address: adminAddress,
    packageId: PACKAGE_ID,
    ttlMin: 30,
    signer: adminKeypair,
    suiClient: suiClient as unknown as Parameters<
      typeof SessionKey.create
    >[0]["suiClient"],
  });

  const ciphertext = await readBytesViaAggregator(
    payloadBlobId,
    WALRUS_NETWORK,
  );

  const threshold = tier === PRIVACY_THRESHOLD ? 1 : 1;
  await seal.fetchKeys({
    ids: [bytesToHex(identity)],
    txBytes,
    sessionKey: session,
    threshold,
  });
  const plainBytes = await seal.decrypt({
    data: ciphertext,
    sessionKey: session,
    txBytes,
  });

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(plainBytes));
  } catch (e) {
    return NextResponse.json(
      {
        error: `Decrypt OK but payload not valid JSON: ${
          e instanceof Error ? e.message : String(e)
        }`,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ payload });
}

function buildTierIdentity(args: {
  formId: string;
  tier: number;
  unlockMs?: bigint;
  conditionalPolicyId?: string;
}): Uint8Array {
  const formIdBytes = hexToBytes(args.formId.replace(/^0x/, ""));
  const tierByte = new Uint8Array([args.tier]);
  let extra: Uint8Array;
  if (args.tier === PRIVACY_TIME_LOCKED) {
    extra = u64ToBytes(args.unlockMs ?? BigInt(0));
  } else if (args.tier === PRIVACY_CONDITIONAL) {
    extra = new TextEncoder().encode(args.conditionalPolicyId ?? "");
  } else {
    extra = new Uint8Array(0);
  }
  const out = new Uint8Array(
    formIdBytes.length + tierByte.length + extra.length,
  );
  out.set(formIdBytes, 0);
  out.set(tierByte, formIdBytes.length);
  out.set(extra, formIdBytes.length + tierByte.length);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}
function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2) throw new Error("invalid hex length");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
function u64ToBytes(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  const mask = BigInt(0xff);
  let v = value;
  for (let i = 7; i >= 0; i--) {
    out[i] = Number(v & mask);
    v = v >> BigInt(8);
  }
  return out;
}

const TESTNET_AGGREGATORS = [
  "https://aggregator.walrus-testnet.walrus.space",
  "https://wal-aggregator-testnet.staketab.org",
];
const MAINNET_AGGREGATORS = [
  "https://aggregator.walrus.atalma.io",
  "https://walrus-mainnet-aggregator.nodes.guru",
];

async function readBytesViaAggregator(
  blobId: string,
  network: "testnet" | "mainnet",
): Promise<Uint8Array> {
  const list =
    network === "mainnet" ? MAINNET_AGGREGATORS : TESTNET_AGGREGATORS;
  let lastErr: unknown = null;
  for (const base of list) {
    try {
      const resp = await fetch(`${base}/v1/blobs/${blobId}`);
      if (!resp.ok) {
        lastErr = new Error(`${base} HTTP ${resp.status}`);
        continue;
      }
      return new Uint8Array(await resp.arrayBuffer());
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `All aggregators failed for ${blobId}: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  );
}

async function jsonRpcQueryEvents(
  fullnodeUrl: string,
  moveEventType: string,
): Promise<SubmissionMadeEvent[]> {
  const resp = await fetch(fullnodeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "suix_queryEvents",
      params: [{ MoveEventType: moveEventType }, null, 200, true],
    }),
  });
  const data = (await resp.json()) as {
    result?: { data?: Array<{ parsedJson?: SubmissionMadeEvent }> };
  };
  return (data.result?.data ?? [])
    .map((e) => e.parsedJson)
    .filter((p): p is SubmissionMadeEvent => !!p);
}
