/**
 * One-shot: transfer every FormOwnerCap currently owned by ADMIN_SECRET_KEY's
 * address to DEMO_ADMIN_ADDRESS. Used to wire the dapp's "Demo admin" mode,
 * which expects the demo address to hold the caps so the server can run
 * seal_approve_admin_only / threshold / conditional PTBs on its behalf.
 *
 * Idempotent — caps already at the target are skipped. Safe to re-run after
 * minting more demo forms.
 *
 * Run from repo root:
 *   pnpm --filter publish exec env-cmd -f .env tsx src/scripts/transferDemoCaps.ts
 */

import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { ENV } from "../env";
import { getSigner } from "../utils/getSigner";
import { getAddress } from "../utils/getAddress";

const PACKAGE_ID =
  process.env.NEXT_PUBLIC_ECHO_PACKAGE_ID ?? process.env.ECHO_PACKAGE_ID ?? "";

interface OwnedCap {
  objectId: string;
  formId: string;
}

async function listOwnedCaps(
  client: SuiGrpcClient,
  owner: string,
): Promise<OwnedCap[]> {
  const out: OwnedCap[] = [];
  let cursor: string | null | undefined = undefined;
  // The SDK paginates owned objects. Loop until the page is exhausted.
  while (true) {
    const page = await client.listOwnedObjects({
      owner,
      type: `${PACKAGE_ID}::form::FormOwnerCap`,
      include: { json: true },
      limit: 200,
      ...(cursor ? { cursor } : {}),
    });
    const objects = page.objects as unknown as Array<{
      objectId: string;
      json: { form_id: string };
    }>;
    for (const o of objects) {
      if (o.json?.form_id) {
        out.push({ objectId: o.objectId, formId: o.json.form_id });
      }
    }
    if (!page.hasNextPage || !page.nextCursor) break;
    cursor = page.nextCursor;
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
  if (!ENV.ADMIN_SECRET_KEY) {
    console.error("ADMIN_SECRET_KEY not set in publish/.env");
    process.exit(1);
  }
  const target = ENV.DEMO_ADMIN_ADDRESS;
  if (!target || !target.startsWith("0x")) {
    console.error(
      "DEMO_ADMIN_ADDRESS not set in publish/.env (the address that should hold demo FormOwnerCaps).",
    );
    process.exit(1);
  }

  const client = new SuiGrpcClient({
    network: ENV.SUI_NETWORK,
    baseUrl: ENV.SUI_FULLNODE_URL,
  });
  const signer = getSigner(ENV.ADMIN_SECRET_KEY);
  const sender = getAddress(ENV.ADMIN_SECRET_KEY);
  console.log(`source admin:  ${sender}`);
  console.log(`demo target:   ${target}`);

  if (sender.toLowerCase() === target.toLowerCase()) {
    console.log("Source and target are the same address. Nothing to do.");
    return;
  }

  console.log(`scanning FormOwnerCaps owned by ${sender}…`);
  const caps = await listOwnedCaps(client, sender);
  console.log(`found ${caps.length} cap(s).`);
  if (caps.length === 0) return;

  // Single PTB transfers all caps at once.
  const tx = new Transaction();
  const objArgs = caps.map((c) => tx.object(c.objectId));
  tx.transferObjects(objArgs, tx.pure.address(target));
  tx.setSender(sender);

  const built = await tx.build({ client });
  const { signature } = await signer.signTransaction(built);
  const resp = await client.executeTransaction({
    transaction: built,
    signatures: [signature],
    include: { effects: true },
  });
  if (resp.FailedTransaction) {
    console.error(
      "transferDemoCaps failed:",
      JSON.stringify(resp.FailedTransaction.effects.status, null, 2),
    );
    process.exit(1);
  }
  if (!resp.Transaction) throw new Error("no Transaction in response");

  console.log("");
  console.log(`✓ transferred ${caps.length} cap(s)`);
  console.log(`  digest: ${resp.Transaction.digest}`);
  for (const c of caps) {
    console.log(`  - ${c.objectId} (form ${c.formId})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
