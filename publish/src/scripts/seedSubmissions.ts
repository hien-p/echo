/**
 * Seed N=3 fake submissions to a form. Reads the form's privacy_tier from
 * chain, builds plausible answers from the schema, encrypts via Seal if the
 * tier requires it, uploads the (cipher)payload to the Walrus testnet
 * publisher, and calls submission::submit with the resulting blob id.
 *
 * Run from repo root:
 *   FORM_ID=0x... pnpm --filter publish exec env-cmd -f .env tsx src/scripts/seedSubmissions.ts
 *
 * Optional: COUNT=5 to seed 5 instead of the default 3.
 */

import { Transaction } from "@mysten/sui/transactions";
import { SUI_CLOCK_OBJECT_ID, fromBase64 } from "@mysten/sui/utils";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SealClient } from "@mysten/seal";

// Default package id matches createSampleForm.ts so the two scripts stay in
// sync even when publish/.env doesn't set ECHO_PACKAGE_ID explicitly.
const PACKAGE_ID =
  process.env.NEXT_PUBLIC_ECHO_PACKAGE_ID ??
  process.env.ECHO_PACKAGE_ID ??
  "0x16dc79451d3035133b33e36acb2e4ccdc50e6a454c603c8feb4707d932da0e46";
const PUBLISHER =
  process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL ??
  "https://publisher.walrus-testnet.walrus.space";
const AGGREGATOR =
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR_URL ??
  "https://aggregator.walrus-testnet.walrus.space";
const FULLNODE =
  process.env.SUI_FULLNODE_URL ?? "https://fullnode.testnet.sui.io:443";
const FORM_ID = process.env.FORM_ID ?? "";
const COUNT = Number(process.env.COUNT ?? "3");

// Mysten Labs allowlisted testnet key servers (Open mode).
const TESTNET_KEY_SERVERS = [
  {
    objectId:
      "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
    weight: 1,
  },
  {
    objectId:
      "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8",
    weight: 1,
  },
];

const PRIVACY_PUBLIC = 0;
const PRIVACY_TIME_LOCKED = 3;
const PRIVACY_CONDITIONAL = 4;

interface OnChainForm {
  schema_blob_id: string;
  privacy_tier: number;
  threshold_n?: number;
  threshold_m?: number;
  unlock_ms?: string;
  conditional_policy_id?: string;
}

interface SchemaField {
  id: string;
  type: string;
  label: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  scale?: number;
}

interface FormSchema {
  version: number;
  fields: SchemaField[];
}

async function uploadBytes(bytes: Uint8Array): Promise<string> {
  const resp = await fetch(`${PUBLISHER}/v1/blobs?epochs=5`, {
    method: "PUT",
    headers: { "content-type": "application/octet-stream" },
    body: bytes as unknown as ArrayBuffer,
  });
  if (!resp.ok) {
    throw new Error(
      `Publisher HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`,
    );
  }
  const json = (await resp.json()) as {
    newlyCreated?: { blobObject?: { blobId?: string } };
    alreadyCertified?: { blobId?: string };
  };
  const blobId =
    json.newlyCreated?.blobObject?.blobId ?? json.alreadyCertified?.blobId;
  if (!blobId) throw new Error("Publisher returned no blob id");
  return blobId;
}

async function fetchJson<T>(blobId: string): Promise<T> {
  const resp = await fetch(`${AGGREGATOR}/v1/blobs/${blobId}`);
  if (!resp.ok) {
    throw new Error(
      `Aggregator HTTP ${resp.status} for ${blobId}: ${await resp.text()}`,
    );
  }
  return (await resp.json()) as T;
}

function generateAnswers(
  schema: FormSchema,
  index: number,
): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const f of schema.fields) {
    switch (f.type) {
      case "short_text":
      case "url":
        answers[f.id] = {
          kind: "text",
          value: `Demo response ${index + 1} — ${f.label.slice(0, 40)}`,
        };
        break;
      case "long_text":
      case "rich_text":
        answers[f.id] = {
          kind: "text",
          value: `Sample submission #${
            index + 1
          }. This is encrypted demo content seeded by seedSubmissions.ts. Field: "${
            f.label
          }".`,
        };
        break;
      case "single_select":
      case "dropdown": {
        const opt = f.options?.[index % (f.options?.length || 1)];
        answers[f.id] = { kind: "choice", value: opt?.value ?? "" };
        break;
      }
      case "multi_select": {
        const optList = f.options ?? [];
        answers[f.id] = {
          kind: "choice",
          value: optList
            .slice(0, Math.min(2, optList.length))
            .map((o) => o.value),
        };
        break;
      }
      case "rating": {
        const scale = f.scale ?? 5;
        answers[f.id] = {
          kind: "rating",
          value: Math.min(scale, Math.max(1, index + 3)),
        };
        break;
      }
      case "checkbox":
        answers[f.id] = { kind: "checkbox", value: index % 2 === 0 };
        break;
      case "date":
      case "time":
        answers[f.id] = {
          kind: "date",
          value: new Date().toISOString().slice(0, 10),
        };
        break;
      default:
        answers[f.id] = { kind: "text", value: "(unsupported field type)" };
    }
  }
  return answers;
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

async function main() {
  if (!PACKAGE_ID || !PACKAGE_ID.startsWith("0x")) {
    console.error(
      "ECHO_PACKAGE_ID (or NEXT_PUBLIC_ECHO_PACKAGE_ID) not set in publish/.env",
    );
    process.exit(1);
  }
  if (!FORM_ID || !FORM_ID.startsWith("0x")) {
    console.error("FORM_ID env var required (the form's Sui object id).");
    process.exit(1);
  }
  const secretKey = process.env.ADMIN_SECRET_KEY;
  if (!secretKey) {
    console.error("ADMIN_SECRET_KEY not set in publish/.env");
    process.exit(1);
  }

  const keypair = Ed25519Keypair.fromSecretKey(fromBase64(secretKey).slice(1));
  const sender = keypair.getPublicKey().toSuiAddress();
  console.log(`submitter: ${sender}`);
  console.log(`form:      ${FORM_ID}`);
  console.log(`count:     ${COUNT}`);

  const client = new SuiGrpcClient({ network: "testnet", baseUrl: FULLNODE });

  // 1. Read form on-chain.
  const formObj = await client.getObject({
    objectId: FORM_ID,
    include: { json: true },
  });
  const onChain = formObj.object.json as OnChainForm | null;
  if (!onChain) throw new Error("Form not found.");
  const tier = onChain.privacy_tier;
  const unlockMs = onChain.unlock_ms ? BigInt(onChain.unlock_ms) : 0n;
  const thresholdM = Number(onChain.threshold_m ?? 0);
  console.log(`tier=${tier} unlockMs=${unlockMs} threshold_m=${thresholdM}`);

  // 2. Fetch schema from Walrus.
  const schema = await fetchJson<FormSchema>(onChain.schema_blob_id);
  console.log(`schema fields: ${schema.fields.map((f) => f.id).join(", ")}`);

  // 3. Build a Seal client only if needed.
  let seal: SealClient | null = null;
  if (tier !== PRIVACY_PUBLIC) {
    seal = new SealClient({
      suiClient: client as unknown as ConstructorParameters<
        typeof SealClient
      >[0]["suiClient"],
      serverConfigs: TESTNET_KEY_SERVERS,
      verifyKeyServers: false,
    });
  }

  const sealThreshold = thresholdM > 0 ? thresholdM : 1;
  const identity =
    tier !== PRIVACY_PUBLIC
      ? buildTierIdentity({
          formId: FORM_ID,
          tier,
          unlockMs,
          conditionalPolicyId: onChain.conditional_policy_id ?? "",
        })
      : null;

  // 4. Loop COUNT times, encrypt+upload+submit each.
  for (let i = 0; i < COUNT; i++) {
    console.log(`\n[${i + 1}/${COUNT}] generating...`);
    const payload = {
      schemaVersion: schema.version,
      answers: generateAnswers(schema, i),
      submittedAt: new Date().toISOString(),
    };
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));

    let bytes: Uint8Array;
    if (seal && identity) {
      const result = await seal.encrypt({
        threshold: sealThreshold,
        packageId: PACKAGE_ID,
        id: bytesToHex(identity),
        data: plaintext,
      });
      bytes = result.encryptedObject;
      console.log(
        `  encrypted: ${plaintext.length}B → ${bytes.length}B (Seal)`,
      );
    } else {
      bytes = plaintext;
      console.log(`  plaintext: ${bytes.length}B`);
    }

    const blobId = await uploadBytes(bytes);
    console.log(`  walrus blob: ${blobId}`);

    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::submission::submit`,
      arguments: [
        tx.object(FORM_ID),
        tx.pure.string(blobId),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    tx.setSender(sender);

    const built = await tx.build({ client });
    const { signature } = await keypair.signTransaction(built);
    const resp = await client.executeTransaction({
      transaction: built,
      signatures: [signature],
      include: { effects: true },
    });
    if (resp.FailedTransaction) {
      console.error(
        `  submit failed:`,
        JSON.stringify(resp.FailedTransaction.effects.status, null, 2),
      );
      process.exit(1);
    }
    console.log(`  digest: ${resp.Transaction!.digest}`);
  }

  console.log(`\n✓ seeded ${COUNT} submissions to ${FORM_ID}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
