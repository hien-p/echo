import { NextResponse } from "next/server";

export const runtime = "edge";
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

interface IndexRequest {
  formId: string;
}

interface SubmissionMadeEvent {
  form_id: string;
  submission_id: string;
  submitter: string;
  schema_version: string;
  anonymous: boolean;
}

/**
 * Index a form's existing Public submissions into a Memwal namespace so the
 * /query route can RAG over them. Encrypted-tier submissions are skipped —
 * indexing those would require decrypt-on-server which needs a session-key
 * delegation we don't have. Indexing is idempotent at the namespace key level.
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
          "Memwal not configured. Set MEMWAL_PRIVATE_KEY + MEMWAL_ACCOUNT_ID as CF Pages secrets.",
      },
      { status: 500 },
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

  let body: IndexRequest;
  try {
    body = (await request.json()) as IndexRequest;
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
  const {
    WalrusClient,
    TESTNET_WALRUS_PACKAGE_CONFIG,
    MAINNET_WALRUS_PACKAGE_CONFIG,
  } = await import("@mysten/walrus");
  const { MemWal } = await import("@mysten-incubation/memwal");

  const suiClient = new SuiGrpcClient({
    network: SUI_NETWORK as "testnet" | "mainnet" | "devnet",
    baseUrl: SUI_FULLNODE,
  });

  // 1. Read the form's tier + unlock_ms.
  const formObj = await suiClient.getObject({
    objectId: body.formId,
    include: { json: true },
  });
  const onChain = formObj.object.json as {
    privacy_tier: number;
    metadata_blob_id: string;
    unlock_ms?: string;
  } | null;
  if (!onChain) {
    return NextResponse.json({ error: "Form not found." }, { status: 404 });
  }

  const PRIVACY_PUBLIC = 0;
  const PRIVACY_TIME_LOCKED = 3;
  const isPublic = onChain.privacy_tier === PRIVACY_PUBLIC;
  const isTimeLocked = onChain.privacy_tier === PRIVACY_TIME_LOCKED;
  const unlockMs = onChain.unlock_ms ? Number(onChain.unlock_ms) : 0;
  const nowMs = Date.now();
  const isUnlocked = isTimeLocked && unlockMs > 0 && nowMs >= unlockMs;

  if (!isPublic && !isUnlocked) {
    return NextResponse.json(
      {
        error:
          onChain.privacy_tier === PRIVACY_TIME_LOCKED
            ? `TimeLocked form not yet unlocked (unlock_ms=${unlockMs}, now=${nowMs}). Will be auto-indexable after the deadline.`
            : "AdminOnly / Threshold / Conditional tiers can't be indexed server-side without a session-key delegation. Use the browser-side indexer on /forms/[id]/admin (coming soon).",
      },
      { status: 400 },
    );
  }

  // 2. Pull SubmissionMade events for this form.
  const eventType = `${PACKAGE_ID}::submission::SubmissionMade`;
  const events = await jsonRpcQueryEvents(SUI_FULLNODE, eventType);
  const matching = events.filter((e) => e.form_id === body.formId);

  if (matching.length === 0) {
    return NextResponse.json({ indexed: 0, skipped: 0 });
  }

  // 3. Walrus + Memwal clients.
  const walrus = new WalrusClient({
    network: WALRUS_NETWORK,
    packageConfig:
      WALRUS_NETWORK === "mainnet"
        ? MAINNET_WALRUS_PACKAGE_CONFIG
        : TESTNET_WALRUS_PACKAGE_CONFIG,
    suiClient,
  });
  const memwal = MemWal.create({
    key: memwalKey,
    accountId: memwalAccountId,
    serverUrl: memwalServerUrl,
  });
  const namespace = `form-${body.formId.slice(2, 16)}`;

  // 4. (TimeLocked only) Build a Seal SessionKey using the Memwal delegate
  //    key as the Sui signer. The TimeLocked policy is permissionless once
  //    unlocked, so any address — including this server's — can fetch keys.
  let sealCtx: {
    seal: import("@mysten/seal").SealClient;
    sessionKey: import("@mysten/seal").SessionKey;
    txBytes: Uint8Array;
  } | null = null;

  if (isTimeLocked) {
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
      /* empty config */
    }
    if (serverConfigs.length === 0) {
      return NextResponse.json(
        {
          error:
            "TimeLocked indexing requires NEXT_PUBLIC_SEAL_KEY_SERVERS to be set.",
        },
        { status: 500 },
      );
    }

    const { SealClient, SessionKey } = await import("@mysten/seal");
    const { Ed25519Keypair } = await import("@mysten/sui/keypairs/ed25519");
    const { Transaction } = await import("@mysten/sui/transactions");
    const { fromHex, SUI_CLOCK_OBJECT_ID } = await import("@mysten/sui/utils");

    const indexerKeypair = Ed25519Keypair.fromSecretKey(fromHex(memwalKey));
    const indexerAddress = indexerKeypair.getPublicKey().toSuiAddress();

    const seal = new SealClient({
      suiClient: suiClient as unknown as ConstructorParameters<
        typeof SealClient
      >[0]["suiClient"],
      serverConfigs,
      verifyKeyServers: false,
    });

    const session = await SessionKey.create({
      address: indexerAddress,
      packageId: PACKAGE_ID,
      ttlMin: 30,
      signer: indexerKeypair,
      suiClient: suiClient as unknown as Parameters<
        typeof SessionKey.create
      >[0]["suiClient"],
    });

    // Build seal_approve_time_locked PTB matching the form's tier identity.
    const formIdHex = body.formId.replace(/^0x/, "");
    const formIdBytes = fromHex(formIdHex);
    const tierByte = new Uint8Array([PRIVACY_TIME_LOCKED]);
    const u64 = new Uint8Array(8);
    let v = BigInt(unlockMs);
    for (let i = 7; i >= 0; i--) {
      u64[i] = Number(v & BigInt(0xff));
      v = v >> BigInt(8);
    }
    const identity = new Uint8Array(formIdBytes.length + 1 + u64.length);
    identity.set(formIdBytes, 0);
    identity.set(tierByte, formIdBytes.length);
    identity.set(u64, formIdBytes.length + 1);

    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::form::seal_approve_time_locked`,
      arguments: [
        tx.pure.vector("u8", Array.from(identity)),
        tx.object(body.formId),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    const txBytes = await tx.build({
      client: suiClient,
      onlyTransactionKind: true,
    });

    sealCtx = { seal, sessionKey: session, txBytes };
  }

  // 4. For each submission: read on-chain ref → walrus blob → flatten answers
  //    to text → remember.
  let indexed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const e of matching) {
    try {
      const subResp = await suiClient.getObject({
        objectId: e.submission_id,
        include: { json: true },
      });
      const sub = subResp.object.json as { payload_blob_id: string } | null;
      if (!sub?.payload_blob_id) {
        skipped++;
        continue;
      }
      const bytes = await walrus.readBlob({ blobId: sub.payload_blob_id });

      let plaintext: Uint8Array;
      if (sealCtx) {
        // TimeLocked: bytes are Seal ciphertext. Decrypt server-side.
        plaintext = await sealCtx.seal.decrypt({
          data: bytes,
          sessionKey: sealCtx.sessionKey,
          txBytes: sealCtx.txBytes,
        });
      } else {
        plaintext = bytes;
      }

      const payload = JSON.parse(new TextDecoder().decode(plaintext)) as {
        answers: Record<string, { kind: string; value: unknown }>;
      };
      const text = flattenAnswersToText(payload.answers, e.submission_id);
      if (!text) {
        skipped++;
        continue;
      }
      await memwal.remember(text, namespace);
      indexed++;
    } catch (err) {
      errors.push(
        `${e.submission_id.slice(0, 10)}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      skipped++;
    }
  }

  return NextResponse.json({
    indexed,
    skipped,
    namespace,
    errors: errors.slice(0, 5),
  });
}

function flattenAnswersToText(
  answers: Record<string, { kind: string; value: unknown }>,
  submissionId: string,
): string {
  const parts: string[] = [`[submission ${submissionId.slice(0, 10)}]`];
  for (const [fieldId, ans] of Object.entries(answers)) {
    const v = ans.value;
    let text = "";
    if (typeof v === "string") text = v;
    else if (typeof v === "number" || typeof v === "boolean") text = String(v);
    else if (Array.isArray(v)) text = v.join(", ");
    if (text.trim()) parts.push(`${fieldId}: ${text}`);
  }
  return parts.length > 1 ? parts.join("\n") : "";
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
