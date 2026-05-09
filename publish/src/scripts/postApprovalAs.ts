/**
 * Post an ApprovalWitness as a specific signer (e.g. the memwal account that
 * holds one of the multisig demo's caps but isn't a wallet you can connect
 * to in the browser). Lets you finalize a 2-of-3 demo end-to-end without
 * needing three browser-controllable wallets.
 *
 * Run from publish/:
 *   FORM_ID=0x... \
 *   SIGNER_PRIVATE_KEY=<32-byte hex>  (or 33-byte base64 with scheme byte) \
 *   pnpm exec env-cmd -f .env tsx src/scripts/postApprovalAs.ts
 *
 * Defaults:
 *   - SIGNER_PRIVATE_KEY falls back to MEMWAL_PRIVATE_KEY (32-byte hex).
 *   - PACKAGE_ID falls back to NEXT_PUBLIC_ECHO_PACKAGE_ID then ECHO_PACKAGE_ID.
 *   - If the signer's Sui balance is < 0.01 SUI, the script tops it up from
 *     ADMIN_SECRET_KEY's account first so the post_approval tx can pay gas.
 */

import { Transaction } from "@mysten/sui/transactions";
import { SUI_CLOCK_OBJECT_ID, fromBase64 } from "@mysten/sui/utils";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

const PACKAGE_ID =
  process.env.NEXT_PUBLIC_ECHO_PACKAGE_ID ??
  process.env.ECHO_PACKAGE_ID ??
  "0xf7e9261724da6c6ae4869bbf623ead796ea31f6a90ea8dcdb30d35568870763c";
const FULLNODE =
  process.env.SUI_FULLNODE_URL ?? "https://fullnode.testnet.sui.io:443";

const FORM_ID = process.env.FORM_ID ?? "";

const PRIVACY_THRESHOLD = 2;

function loadSignerKey(): Ed25519Keypair {
  const raw = process.env.SIGNER_PRIVATE_KEY ?? process.env.MEMWAL_PRIVATE_KEY;
  if (!raw) {
    throw new Error(
      "Set SIGNER_PRIVATE_KEY (or MEMWAL_PRIVATE_KEY) — 32-byte hex or 33-byte base64.",
    );
  }
  // Heuristic: hex if length 64 + only [0-9a-f]; else assume base64.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Ed25519Keypair.fromSecretKey(hexToBytes(raw));
  }
  // Base64, possibly with the 1-byte scheme prefix Sui CLI adds.
  const buf = fromBase64(raw);
  const stripped = buf.length === 33 ? buf.slice(1) : buf;
  return Ed25519Keypair.fromSecretKey(stripped);
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2) throw new Error("invalid hex length");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

interface FormJson {
  privacy_tier: number;
  threshold_n: number;
  threshold_m: number;
}

interface OwnedObj {
  objectId: string;
  json?: { form_id?: string };
}

async function main() {
  if (!FORM_ID.startsWith("0x")) {
    console.error("FORM_ID env var required (e.g. 0x80646...).");
    process.exit(1);
  }
  const signer = loadSignerKey();
  const signerAddr = signer.getPublicKey().toSuiAddress();
  console.log(`signer: ${signerAddr}`);
  console.log(`form:   ${FORM_ID}`);
  console.log(`pkg:    ${PACKAGE_ID}`);

  const client = new SuiGrpcClient({ network: "testnet", baseUrl: FULLNODE });

  // Sanity: form must be Threshold tier.
  const form = await client.getObject({
    objectId: FORM_ID,
    include: { json: true },
  });
  const formJson = form.object.json as unknown as FormJson | null;
  if (!formJson) {
    console.error("Form not found on chain.");
    process.exit(1);
  }
  if (formJson.privacy_tier !== PRIVACY_THRESHOLD) {
    console.error(
      `Form is not Threshold tier (privacy_tier=${formJson.privacy_tier}); post_approval would abort.`,
    );
    process.exit(1);
  }
  console.log(
    `tier=Threshold k=${formJson.threshold_n} n=${formJson.threshold_m}`,
  );

  // Find this signer's FormOwnerCap for this form.
  const owned = (await client.listOwnedObjects({
    owner: signerAddr,
    type: `${PACKAGE_ID}::form::FormOwnerCap`,
    include: { json: true },
    limit: 200,
  })) as unknown as { objects: OwnedObj[] };
  const cap = owned.objects.find((o) => o.json?.form_id === FORM_ID);
  if (!cap) {
    console.error(
      `Signer ${signerAddr} doesn't hold a FormOwnerCap for ${FORM_ID}.`,
    );
    console.error(
      "If this address was supposed to be a co-admin, make sure createSampleForm.ts listed it under EXTRA_ADMINS.",
    );
    process.exit(1);
  }
  console.log(`cap:    ${cap.objectId}`);

  // Top up signer with gas if balance is < 0.01 SUI (10_000_000 mist).
  const balance = await client.getBalance({
    owner: signerAddr,
    coinType: "0x2::sui::SUI",
  });
  const balMist = BigInt(balance.totalBalance);
  if (balMist < 10_000_000n) {
    console.log(
      `signer balance ${balMist} mist < 10_000_000 — topping up from ADMIN_SECRET_KEY...`,
    );
    const adminKey = process.env.ADMIN_SECRET_KEY;
    if (!adminKey) {
      console.error("Need ADMIN_SECRET_KEY in .env to top up signer with gas.");
      process.exit(1);
    }
    const adminKp = Ed25519Keypair.fromSecretKey(fromBase64(adminKey).slice(1));
    const adminAddr = adminKp.getPublicKey().toSuiAddress();
    const topupTx = new Transaction();
    const [coin] = topupTx.splitCoins(topupTx.gas, [
      topupTx.pure.u64(50_000_000n),
    ]);
    topupTx.transferObjects([coin], topupTx.pure.address(signerAddr));
    topupTx.setSender(adminAddr);
    const built = await topupTx.build({ client });
    const { signature } = await adminKp.signTransaction(built);
    const r = await client.executeTransaction({
      transaction: built,
      signatures: [signature],
      include: { effects: true },
    });
    if (r.FailedTransaction) {
      console.error(
        "Top-up failed:",
        JSON.stringify(r.FailedTransaction.effects.status, null, 2),
      );
      process.exit(1);
    }
    console.log(`✓ topped up — digest ${r.Transaction!.digest}`);
    // Brief delay so the new coin shows up in subsequent gas selection.
    await new Promise((res) => setTimeout(res, 1500));
  }

  // Build identity = 32-byte form id + 1-byte tier code (Threshold = 2).
  const formIdBytes = hexToBytes(FORM_ID.replace(/^0x/, ""));
  const identity = new Uint8Array(33);
  identity.set(formIdBytes, 0);
  identity[32] = PRIVACY_THRESHOLD;

  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::form::post_approval`,
    arguments: [
      tx.object(cap.objectId),
      tx.object(FORM_ID),
      tx.pure.vector("u8", Array.from(identity)),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  tx.setSender(signerAddr);

  const built = await tx.build({ client });
  const { signature } = await signer.signTransaction(built);
  const resp = await client.executeTransaction({
    transaction: built,
    signatures: [signature],
    include: { effects: true, events: true },
  });
  if (resp.FailedTransaction) {
    console.error(
      "post_approval failed:",
      JSON.stringify(resp.FailedTransaction.effects.status, null, 2),
    );
    process.exit(1);
  }
  if (!resp.Transaction) throw new Error("expected successful tx");

  const created = resp.Transaction.effects.changedObjects.filter(
    (c) => c.idOperation === "Created",
  );
  const witness = created.find((c) => c.outputOwner?.$kind === "Shared");
  console.log("");
  console.log(`✓ approval witness: ${witness?.objectId ?? "(not found)"}`);
  console.log(`  digest:           ${resp.Transaction.digest}`);
  console.log(
    `  signer counted in /admin's "k/n approvals" badge after the next refetch (~8s).`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
