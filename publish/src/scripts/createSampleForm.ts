/**
 * One-shot demo: uploads a sample schema + metadata to the Walrus testnet
 * publisher and calls echo::form::create_form with the publish admin key.
 *
 * Run from repo root:
 *   pnpm --filter publish exec tsx src/scripts/createSampleForm.ts
 *
 * Prints the resulting Form object id + a /forms/[id] URL you can open.
 */

import { Transaction } from "@mysten/sui/transactions";
import { SUI_CLOCK_OBJECT_ID, fromBase64 } from "@mysten/sui/utils";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const PACKAGE_ID =
  process.env.NEXT_PUBLIC_ECHO_PACKAGE_ID ??
  "0x16dc79451d3035133b33e36acb2e4ccdc50e6a454c603c8feb4707d932da0e46";
const PUBLISHER =
  process.env.NEXT_PUBLIC_WALRUS_PUBLISHER_URL ??
  "https://publisher.walrus-testnet.walrus.space";
const FULLNODE =
  process.env.SUI_FULLNODE_URL ?? "https://fullnode.testnet.sui.io:443";
const PROD_URL = "https://echo-20u.pages.dev";

const SCHEMA = {
  version: 1,
  fields: [
    {
      id: "rating",
      type: "rating",
      label: "How was your Echo demo experience?",
      scale: 5,
      required: true,
    },
    {
      id: "category",
      type: "single_select",
      label: "What did you try?",
      required: true,
      options: [
        { value: "create", label: "Created a form" },
        { value: "submit", label: "Submitted a response" },
        { value: "admin", label: "Opened the admin viewer" },
        { value: "browse", label: "Just clicked around" },
      ],
    },
    {
      id: "feedback",
      type: "long_text",
      label: "Anything that worked well, or felt rough?",
    },
    {
      id: "wallet",
      type: "url",
      label: "Twitter / GitHub link (optional)",
    },
  ],
};

const METADATA = {
  title: "Echo demo · try it out",
  description:
    "Submit anything — gas is sponsored by Enoki, your answer lands on Walrus, the chain records the SubmissionRef. Feedback informs the v0.2 roadmap.",
};

async function uploadJson(data: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
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

async function main() {
  const secretKey = process.env.ADMIN_SECRET_KEY;
  if (!secretKey) {
    console.error("ADMIN_SECRET_KEY not set in publish/.env");
    process.exit(1);
  }
  const keypair = Ed25519Keypair.fromSecretKey(fromBase64(secretKey).slice(1));
  const sender = keypair.getPublicKey().toSuiAddress();
  console.log(`admin: ${sender}`);

  console.log("uploading schema to Walrus publisher…");
  const schemaBlobId = await uploadJson(SCHEMA);
  console.log(`  schema blob: ${schemaBlobId}`);

  console.log("uploading metadata to Walrus publisher…");
  const metadataBlobId = await uploadJson(METADATA);
  console.log(`  metadata blob: ${metadataBlobId}`);

  const client = new SuiGrpcClient({ network: "testnet", baseUrl: FULLNODE });

  const tx = new Transaction();
  const cap = tx.moveCall({
    target: `${PACKAGE_ID}::form::create_form`,
    arguments: [
      tx.pure.string(schemaBlobId),
      tx.pure.string(metadataBlobId),
      tx.pure.u8(0),
      tx.pure.u8(0),
      tx.pure.u8(0),
      tx.pure.u64(0n),
      tx.pure.string(""),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  tx.transferObjects([cap], tx.pure.address(sender));
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
      "create_form failed:",
      JSON.stringify(resp.FailedTransaction.effects.status, null, 2),
    );
    process.exit(1);
  }
  if (!resp.Transaction)
    throw new Error("expected successful tx but got nothing");
  const created = resp.Transaction.effects.changedObjects.filter(
    (c) => c.idOperation === "Created",
  );
  const formObj = created.find((c) => c.outputOwner?.$kind === "Shared");
  if (!formObj) {
    console.error("no shared Form object id in effects");
    process.exit(1);
  }

  console.log("");
  console.log(`✓ form id: ${formObj.objectId}`);
  console.log(`  digest:   ${resp.Transaction.digest}`);
  console.log("");
  console.log("open in browser:");
  console.log(`  prod   → ${PROD_URL}/forms/${formObj.objectId}`);
  console.log(`  local  → http://localhost:3333/forms/${formObj.objectId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
