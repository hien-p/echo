/**
 * Enoki mainnet sponsorship smoke test.
 *
 * Builds a REAL Echo `form::create_form` transactionKind against the
 * mainnet package and posts it to the live /api/sponsor endpoint. Unlike
 * a garbage-bytes probe, this exercises the actual allowlisted Move call
 * target — so a 200 here proves mainnet Enoki sponsorship genuinely works
 * end-to-end (network + key + portal package allowlist all aligned).
 *
 * The sponsor *create* step needs no wallet signature (only the tx kind
 * bytes + a syntactically valid sender), so this runs with a throwaway
 * generated address and spends nothing.
 *
 * Usage:
 *   cd dapp && npx tsx scripts/test-enoki-mainnet.ts
 *   API_BASE=https://staging.echo-20u.pages.dev npx tsx scripts/test-enoki-mainnet.ts
 */

import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { buildCreateFormTx } from "../src/lib/echo/tx";
import { PrivacyTier } from "../src/lib/echo/types";

const API_BASE = process.env.API_BASE ?? "https://staging.echo-20u.pages.dev";
const PACKAGE_ID =
  process.env.ECHO_PACKAGE_ID ??
  "0x9677ab37c9e1097d11034848aee570c50f5c981a2d12756faccbd07d90d502c2";

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

async function main() {
  const sender = Ed25519Keypair.generate().getPublicKey().toSuiAddress();
  const client = new SuiGrpcClient({
    network: "mainnet",
    baseUrl:
      process.env.SUI_FULLNODE_URL ?? "https://fullnode.mainnet.sui.io:443",
  });

  console.log("Enoki mainnet sponsorship test");
  console.log("  endpoint :", `${API_BASE}/api/sponsor`);
  console.log("  package  :", PACKAGE_ID);
  console.log("  sender   :", sender, "(throwaway, unfunded)");
  console.log("  move call:", `${PACKAGE_ID}::form::create_form`);

  const tx = buildCreateFormTx({
    packageId: PACKAGE_ID,
    senderAddress: sender,
    schemaBlobId: "enoki-mainnet-smoketest-schema",
    metadataBlobId: "enoki-mainnet-smoketest-meta",
    privacyTier: PrivacyTier.Public,
  });

  const kindBytes = await tx.build({ client, onlyTransactionKind: true });
  console.log("  tx kind  :", kindBytes.length, "bytes");

  const res = await fetch(`${API_BASE}/api/sponsor`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      transactionKindBytes: b64(kindBytes),
      sender,
    }),
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  console.log("\nHTTP", res.status);
  console.log(JSON.stringify(json, null, 2));

  if (res.ok && typeof json.bytes === "string" && json.bytes.length > 0) {
    console.log(
      "\n✅ PASS — Enoki sponsored the real Echo tx on mainnet. Gas-free submit/create works.",
    );
    process.exit(0);
  }
  if (json.network && json.network !== "mainnet") {
    console.log(
      `\n❌ FAIL — route is calling Enoki with network="${json.network}". ENOKI_SPONSOR_NETWORK not bound (needs a fresh cf-deploy after the secret is set).`,
    );
  } else {
    console.log(
      "\n❌ FAIL — Enoki rejected a VALID Echo tx on mainnet. Most likely the Enoki developer portal hasn't allowlisted this mainnet package / its Move call targets for the API key. See the `detail` field above.",
    );
  }
  process.exit(1);
}

main().catch((e) => {
  console.error("test crashed:", e);
  process.exit(2);
});
