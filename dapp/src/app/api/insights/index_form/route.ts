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

  // 1. Verify the form is Public; we can only RAG over plaintext.
  const formObj = await suiClient.getObject({
    objectId: body.formId,
    include: { json: true },
  });
  const onChain = formObj.object.json as {
    privacy_tier: number;
    metadata_blob_id: string;
  } | null;
  if (!onChain) {
    return NextResponse.json({ error: "Form not found." }, { status: 404 });
  }
  if (onChain.privacy_tier !== 0) {
    return NextResponse.json(
      {
        error:
          "Only Public-tier forms can be indexed. Encrypted tiers would need a session-key delegation that's out of scope for the indexer.",
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
      const payload = JSON.parse(new TextDecoder().decode(bytes)) as {
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
