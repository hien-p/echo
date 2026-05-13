import { NextResponse } from "next/server";

// Edge runtime — required for Cloudflare Pages. Workerd supports
// AbortSignal.any() and crypto.subtle natively. Local Next.js dev's Edge
// sandbox lacks AbortSignal.any — that's a dev-only quirk; prod works.
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

const PRIVACY_PUBLIC = 0;
const PRIVACY_ADMIN_ONLY = 1;
const PRIVACY_THRESHOLD = 2;
const PRIVACY_TIME_LOCKED = 3;
const PRIVACY_CONDITIONAL = 4;

interface IndexRequest {
  formId: string;
  /** When true, do everything except memwal.remember(). Returns the
   *  flattened text per submission so callers can use it as a direct-
   *  context fallback when the Memwal relayer is sick. */
  dryRun?: boolean;
  /** When true, return a `text/event-stream` ReadableStream emitting
   *  per-submission progress events instead of a single JSON response.
   *  Mutually exclusive with dryRun (dryRun's primary consumer is the
   *  query route's fallback, which doesn't need progress). */
  stream?: boolean;
}

interface OnChainForm {
  privacy_tier: number;
  metadata_blob_id: string;
  unlock_ms?: string;
  conditional_policy_id?: string;
  threshold_m?: number;
  owner: string;
}

interface SubmissionMadeEvent {
  form_id: string;
  submission_id: string;
  submitter: string;
  schema_version: string;
  anonymous: boolean;
  /** Set by jsonRpcQueryEvents from the envelope's timestampMs — used
   *  to bake a ts: tag into each indexed memory text so the query
   *  route's scope chip can hard-filter by date. */
  timestampMs?: string;
}

/**
 * Index a form's submissions into a Memwal namespace so /api/insights/query
 * can RAG over them. Supported paths:
 *
 *   - Public:                      no Seal needed, plaintext bytes are the payload.
 *   - TimeLocked (post-unlock):    Seal policy is permissionless after unlock_ms,
 *                                  any keypair signs the SessionKey.
 *   - AdminOnly / Threshold / Conditional + form.owner == indexer:
 *                                  indexer holds the FormOwnerCap and signs
 *                                  the SessionKey on its own behalf. This is
 *                                  the demo-mode path — typically only
 *                                  DEMO_ADMIN_SECRET_KEY's address satisfies
 *                                  the owner check.
 *
 * Indexer keypair priority: DEMO_ADMIN_SECRET_KEY (base64+flag) >
 * MEMWAL_PRIVATE_KEY (hex). The demo key is preferred because it doubles as
 * the form owner for demo-curated forms, unlocking the encrypted-tier path.
 */
export async function POST(request: Request) {
  const memwalKey = process.env.MEMWAL_PRIVATE_KEY;
  const memwalAccountId = process.env.MEMWAL_ACCOUNT_ID;
  const memwalServerUrl =
    process.env.MEMWAL_SERVER_URL ?? "https://relayer.dev.memwal.ai";
  const demoAdminSecret = process.env.DEMO_ADMIN_SECRET_KEY;

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
  const { MemWal } = await import("@mysten-incubation/memwal");

  const suiClient = new SuiGrpcClient({
    network: SUI_NETWORK as "testnet" | "mainnet" | "devnet",
    baseUrl: SUI_FULLNODE,
  });

  // 1. Read the form's tier + owner.
  const formObj = await suiClient.getObject({
    objectId: body.formId,
    include: { json: true },
  });
  const onChain = formObj.object.json as OnChainForm | null;
  if (!onChain) {
    return NextResponse.json({ error: "Form not found." }, { status: 404 });
  }

  const tier = onChain.privacy_tier;
  const isPublic = tier === PRIVACY_PUBLIC;
  const isTimeLocked = tier === PRIVACY_TIME_LOCKED;
  const unlockMs = onChain.unlock_ms ? Number(onChain.unlock_ms) : 0;
  const nowMs = Date.now();
  const isUnlocked = isTimeLocked && unlockMs > 0 && nowMs >= unlockMs;
  const needsCap =
    tier === PRIVACY_ADMIN_ONLY ||
    tier === PRIVACY_THRESHOLD ||
    tier === PRIVACY_CONDITIONAL;

  // 2. Pick the indexer keypair (demo > memwal).
  const { Ed25519Keypair } = await import("@mysten/sui/keypairs/ed25519");
  const { fromBase64, fromHex, SUI_CLOCK_OBJECT_ID } =
    await import("@mysten/sui/utils");
  let indexerKeypair: import("@mysten/sui/keypairs/ed25519").Ed25519Keypair;
  let indexerSource: "demo" | "memwal";
  try {
    if (demoAdminSecret) {
      indexerKeypair = Ed25519Keypair.fromSecretKey(
        fromBase64(demoAdminSecret).slice(1),
      );
      indexerSource = "demo";
    } else {
      indexerKeypair = Ed25519Keypair.fromSecretKey(fromHex(memwalKey));
      indexerSource = "memwal";
    }
  } catch (e) {
    return NextResponse.json(
      {
        error: `Failed to derive indexer keypair: ${
          e instanceof Error ? e.message : String(e)
        }`,
      },
      { status: 500 },
    );
  }
  const indexerAddress = indexerKeypair.getPublicKey().toSuiAddress();

  // 3. Gate non-Public tiers.
  if (!isPublic) {
    if (isTimeLocked && !isUnlocked) {
      return NextResponse.json(
        {
          error: `TimeLocked form not yet unlocked (unlock_ms=${unlockMs}, now=${nowMs}).`,
        },
        { status: 400 },
      );
    }
    if (
      needsCap &&
      onChain.owner.toLowerCase() !== indexerAddress.toLowerCase()
    ) {
      return NextResponse.json(
        {
          error: `Form owner (${onChain.owner}) doesn't match indexer (${indexerAddress}). AdminOnly/Threshold/Conditional indexing requires the indexer to hold the FormOwnerCap. Set DEMO_ADMIN_SECRET_KEY to the form owner's key, or use the browser-side indexer.`,
        },
        { status: 403 },
      );
    }
  }

  // 4. Pull SubmissionMade events for this form.
  const eventType = `${PACKAGE_ID}::submission::SubmissionMade`;
  const events = await jsonRpcQueryEvents(SUI_FULLNODE, eventType);
  const matching = events.filter((e) => e.form_id === body.formId);

  if (matching.length === 0) {
    return NextResponse.json({
      indexed: 0,
      skipped: 0,
      deduped: 0,
      events: 0,
      indexerSource,
      tier,
    });
  }

  // 5. Memwal client (Walrus blobs are fetched via the public aggregator).
  const memwal = MemWal.create({
    key: memwalKey,
    accountId: memwalAccountId,
    serverUrl: memwalServerUrl,
  });
  const namespace = `form-${body.formId.slice(2, 16)}`;

  // 6. Build a Seal context for any non-Public tier.
  let sealCtx: {
    seal: import("@mysten/seal").SealClient;
    sessionKey: import("@mysten/seal").SessionKey;
    txBytes: Uint8Array;
  } | null = null;

  if (!isPublic) {
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
            "Encrypted-tier indexing requires NEXT_PUBLIC_SEAL_KEY_SERVERS to be set.",
        },
        { status: 500 },
      );
    }

    const { SealClient, SessionKey } = await import("@mysten/seal");
    const { Transaction } = await import("@mysten/sui/transactions");

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

    // Look up the FormOwnerCap if the tier requires one.
    let formOwnerCapId: string | null = null;
    if (needsCap) {
      const owned = await suiClient.listOwnedObjects({
        owner: indexerAddress,
        type: `${PACKAGE_ID}::form::FormOwnerCap`,
        include: { json: true },
        limit: 200,
      });
      const match = (
        owned.objects as unknown as Array<{
          objectId: string;
          json: { form_id: string };
        }>
      ).find((c) => c.json?.form_id === body.formId);
      formOwnerCapId = match?.objectId ?? null;
      if (!formOwnerCapId) {
        return NextResponse.json(
          {
            error:
              "Indexer-derived address claims to own the form but no matching FormOwnerCap was found in its object list. Did transferDemoCaps run?",
          },
          { status: 412 },
        );
      }
    }

    // Identity bytes match the on-chain seal_approve_*'s expected layout.
    const identity = buildTierIdentity({
      formId: body.formId,
      tier,
      unlockMs: BigInt(unlockMs),
      conditionalPolicyId: onChain.conditional_policy_id ?? "",
    });

    const tx = new Transaction();
    const idArg = tx.pure.vector("u8", Array.from(identity));
    switch (tier) {
      case PRIVACY_ADMIN_ONLY:
        tx.moveCall({
          target: `${PACKAGE_ID}::form::seal_approve_admin_only`,
          arguments: [
            idArg,
            tx.object(body.formId),
            tx.object(formOwnerCapId!),
          ],
        });
        break;
      case PRIVACY_THRESHOLD:
        tx.moveCall({
          target: `${PACKAGE_ID}::form::seal_approve_threshold`,
          arguments: [
            idArg,
            tx.object(body.formId),
            tx.object(formOwnerCapId!),
          ],
        });
        break;
      case PRIVACY_TIME_LOCKED:
        tx.moveCall({
          target: `${PACKAGE_ID}::form::seal_approve_time_locked`,
          arguments: [
            idArg,
            tx.object(body.formId),
            tx.object(SUI_CLOCK_OBJECT_ID),
          ],
        });
        break;
      case PRIVACY_CONDITIONAL:
        tx.moveCall({
          target: `${PACKAGE_ID}::form::seal_approve_conditional`,
          arguments: [
            idArg,
            tx.object(body.formId),
            tx.object(formOwnerCapId!),
          ],
        });
        break;
      default:
        return NextResponse.json(
          { error: `Unsupported tier ${tier}.` },
          { status: 400 },
        );
    }
    // Sender must own any owned objects referenced in the PTB (FormOwnerCap
    // for AdminOnly/Threshold/Conditional). TimeLocked uses only the shared
    // Form + Clock, so setSender is harmless either way.
    tx.setSender(indexerAddress);
    const txBytes = await tx.build({
      client: suiClient,
      onlyTransactionKind: true,
    });

    sealCtx = { seal, sessionKey: session, txBytes };
  }

  // 7. Dedupe: pull existing memories once and extract every
  // [submission 0xabc…] prefix. Subsequent indexings of the same form
  // skip submissions whose 10-char prefix is already stored, so the
  // namespace doesn't bloat from re-clicking "Index this form".
  const alreadyIndexed = new Set<string>();
  try {
    const existing = await memwal.recall(
      "submission response feedback answer comment",
      200,
      namespace,
    );
    for (const m of existing.results) {
      const r = m as { text?: string };
      if (!r.text) continue;
      const match = /\[submission (0x[0-9a-f]+)\]/i.exec(r.text);
      if (match) alreadyIndexed.add(match[1].toLowerCase());
    }
  } catch {
    // Empty namespace or recall error — proceed without dedupe; remember()
    // will just create duplicates which is recoverable.
  }

  // 8. Per-submission: walrus → (decrypt) → flatten → remember.
  //
  // Two output shapes depending on `body.stream`:
  //   - false (default): collect everything and return JSON at the end.
  //   - true: return an SSE stream emitting per-submission progress
  //           events, then a final {event:"done"} carrying the summary.
  // The actual work is identical; only the reporting differs.

  if (body.stream && !body.dryRun) {
    return new Response(
      buildIndexingStream({
        matching,
        suiClient,
        memwal,
        sealCtx,
        alreadyIndexed,
        namespace,
        walrusNetwork: WALRUS_NETWORK,
        indexerSource,
        tier,
      }),
      {
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
        },
      },
    );
  }

  let indexed = 0;
  let skipped = 0;
  let deduped = 0;
  const errors: string[] = [];
  // dryRun mode collects the flattened texts so the caller (typically
  // /api/insights/query as a fallback when Memwal is unhealthy) can use
  // them as direct LLM context without depending on Memwal's job pipeline.
  const texts: Array<{ submissionId: string; text: string }> = [];

  for (const e of matching) {
    const shortId = e.submission_id.slice(0, 10).toLowerCase();
    if (alreadyIndexed.has(shortId)) {
      deduped++;
      continue;
    }
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
      const bytes = await readBytesViaAggregator(
        sub.payload_blob_id,
        WALRUS_NETWORK,
      );

      let plaintext: Uint8Array;
      if (sealCtx) {
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
      const submitterName = await lookupSuinsName(e.submitter);
      const text = flattenAnswersToText(
        payload.answers,
        e.submission_id,
        e.submitter,
        submitterName,
        e.timestampMs,
      );
      if (!text) {
        skipped++;
        continue;
      }
      if (body.dryRun) {
        texts.push({ submissionId: e.submission_id, text });
        indexed++;
      } else {
        await memwal.remember(text, namespace);
        indexed++;
      }
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
    deduped,
    events: matching.length,
    namespace,
    indexerSource,
    tier,
    errors: errors.slice(0, 5),
    ...(body.dryRun ? { texts } : {}),
  });
}

/**
 * Stream-mode per-submission loop. Emits SSE `progress` events as each
 * submission moves through fetch_walrus → decrypt → embed, then a final
 * `done` event with the summary. Errors per-submission are non-fatal
 * (mirror the JSON path) and surface in the `done` summary's errors[].
 */
function buildIndexingStream(args: {
  matching: SubmissionMadeEvent[];
  suiClient: import("@mysten/sui/grpc").SuiGrpcClient;
  memwal: import("@mysten-incubation/memwal").MemWal;
  sealCtx: {
    seal: import("@mysten/seal").SealClient;
    sessionKey: import("@mysten/seal").SessionKey;
    txBytes: Uint8Array;
  } | null;
  alreadyIndexed: Set<string>;
  namespace: string;
  walrusNetwork: "testnet" | "mainnet";
  indexerSource: "demo" | "memwal";
  tier: number;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(obj)}\n\n`),
          );
        } catch {
          /* controller closed — client disconnected */
        }
      };

      const total = args.matching.length;
      let indexed = 0;
      let skipped = 0;
      let deduped = 0;
      const errors: string[] = [];

      send({
        event: "progress",
        stage: "query_events",
        current: total,
        total,
        message: `Found ${total} submission${total === 1 ? "" : "s"} on chain`,
      });

      for (let i = 0; i < args.matching.length; i++) {
        const e = args.matching[i];
        const shortId = e.submission_id.slice(0, 10).toLowerCase();
        if (args.alreadyIndexed.has(shortId)) {
          deduped++;
          send({
            event: "progress",
            stage: "embed",
            current: i + 1,
            total,
            message: `Skipped ${shortId} (already indexed)`,
          });
          continue;
        }

        try {
          send({
            event: "progress",
            stage: "fetch_walrus",
            current: i + 1,
            total,
            message: `Fetching Walrus blob ${i + 1}/${total}`,
          });

          const subResp = await args.suiClient.getObject({
            objectId: e.submission_id,
            include: { json: true },
          });
          const sub = subResp.object.json as { payload_blob_id: string } | null;
          if (!sub?.payload_blob_id) {
            skipped++;
            continue;
          }
          const bytes = await readBytesViaAggregator(
            sub.payload_blob_id,
            args.walrusNetwork,
          );

          send({
            event: "progress",
            stage: "decrypt",
            current: i + 1,
            total,
            message: `Decrypting ${i + 1}/${total}`,
          });

          let plaintext: Uint8Array;
          if (args.sealCtx) {
            plaintext = await args.sealCtx.seal.decrypt({
              data: bytes,
              sessionKey: args.sealCtx.sessionKey,
              txBytes: args.sealCtx.txBytes,
            });
          } else {
            plaintext = bytes;
          }

          const payload = JSON.parse(new TextDecoder().decode(plaintext)) as {
            answers: Record<string, { kind: string; value: unknown }>;
          };
          const submitterName = await lookupSuinsName(e.submitter);
          const text = flattenAnswersToText(
            payload.answers,
            e.submission_id,
            e.submitter,
            submitterName,
            e.timestampMs,
          );
          if (!text) {
            skipped++;
            continue;
          }

          send({
            event: "progress",
            stage: "embed",
            current: i + 1,
            total,
            message: `Indexing ${i + 1}/${total} to Memwal`,
          });

          await args.memwal.remember(text, args.namespace);
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

      send({
        event: "done",
        stage: "done",
        indexed,
        skipped,
        deduped,
        events: total,
        namespace: args.namespace,
        indexerSource: args.indexerSource,
        tier: args.tier,
        errors: errors.slice(0, 5),
      });
      controller.close();
    },
    cancel() {
      /* client disconnected — best-effort cleanup; in-flight awaits will
         throw but each iteration handles its own try/catch */
    },
  });
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

function flattenAnswersToText(
  answers: Record<string, { kind: string; value: unknown }>,
  submissionId: string,
  submitter?: string,
  submitterName?: string | null,
  timestampMs?: string | number,
): string {
  // Header includes submission id + optional ts: epoch ms + submitter
  // handle. Query route parses the ts: tag for scope-chip filtering;
  // memories indexed before this change have no ts: tag and bypass
  // the filter (treated as always-in-window for backward compat).
  const isAnon = !submitter || submitter === "0x0";
  const handle = isAnon
    ? "anonymous"
    : submitterName
      ? `${submitterName}.sui`
      : `${submitter.slice(0, 10)}…`;
  const tsTag =
    timestampMs != null && timestampMs !== ""
      ? ` ts:${String(timestampMs)}`
      : "";
  const parts: string[] = [
    `[submission ${submissionId.slice(0, 10)}${tsTag} from ${handle}]`,
  ];
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

/**
 * SuiNS reverse lookup via Sui RPC's suix_resolveNameServiceNames, with a
 * per-process cache so we don't re-hit RPC for every submission from the
 * same submitter. Returns null on miss/error/no-name. Strips the `.sui`
 * suffix so the caller can format display consistently.
 */
const SUINS_CACHE = new Map<string, string | null>();
async function lookupSuinsName(address: string): Promise<string | null> {
  if (!address?.startsWith("0x") || address === "0x0") return null;
  if (SUINS_CACHE.has(address)) return SUINS_CACHE.get(address) ?? null;
  try {
    const resp = await fetch(SUI_FULLNODE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "suix_resolveNameServiceNames",
        params: [address],
      }),
      cache: "no-store",
    });
    if (!resp.ok) {
      SUINS_CACHE.set(address, null);
      return null;
    }
    const json = (await resp.json()) as {
      result?: { data?: string[] };
    };
    const first = json.result?.data?.[0];
    const out = first ? first.replace(/\.sui$/i, "") : null;
    SUINS_CACHE.set(address, out);
    return out;
  } catch {
    SUINS_CACHE.set(address, null);
    return null;
  }
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
    result?: {
      data?: Array<{
        parsedJson?: SubmissionMadeEvent;
        timestampMs?: string;
      }>;
    };
  };
  return (data.result?.data ?? [])
    .map((e) =>
      e.parsedJson
        ? ({
            ...e.parsedJson,
            timestampMs: e.timestampMs,
          } as SubmissionMadeEvent)
        : undefined,
    )
    .filter((p): p is SubmissionMadeEvent => !!p);
}
