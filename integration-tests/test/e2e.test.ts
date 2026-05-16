import { describe, it, expect, inject } from "vitest";
import { Transaction } from "@mysten/sui/transactions";
import { SUI_CLOCK_OBJECT_ID } from "@mysten/sui/utils";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { loadAccountKeypair } from "../src/utils/getNewAccount";

/**
 * Localnet quirk: `executeTransaction` returns once the tx commits, but
 * the GRPC node's object index lags by a checkpoint or two. Subsequent
 * `tx.object(id)` calls then 404 with "Object not found". Poll
 * `getObject` until each id resolves before letting the test continue.
 */
async function waitForObjects(
  client: SuiGrpcClient,
  ids: string[],
  {
    timeoutMs = 8_000,
    intervalMs = 100,
  }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const pending = new Set(ids);
  while (pending.size > 0) {
    if (Date.now() > deadline) {
      throw new Error(
        `waitForObjects timeout after ${timeoutMs}ms, still missing: ${[...pending].join(", ")}`,
      );
    }
    await Promise.all(
      [...pending].map(async (id) => {
        try {
          await client.getObject({ objectId: id });
          pending.delete(id);
        } catch {
          /* still indexing */
        }
      }),
    );
    if (pending.size > 0) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}

/**
 * Localnet read-after-write race: `executeTransaction` returns at commit,
 * but the GRPC node's object index can still serve the pre-mutation
 * version for a checkpoint or two. A tx built against that stale version
 * is rejected by validators with "object ... is unavailable for
 * consumption ... needs to be rebuilt" (an RpcError thrown *before*
 * execution — distinct from a Move abort, which resolves normally with
 * `FailedTransaction` set). Rebuild a fresh Transaction (re-resolving
 * object versions) and retry only on that specific staleness error.
 */
async function buildSignExecuteWithRetry(
  client: SuiGrpcClient,
  signer: ReturnType<typeof loadAccountKeypair>,
  makeTx: () => Transaction,
  {
    retries = 8,
    intervalMs = 250,
  }: { retries?: number; intervalMs?: number } = {},
) {
  for (let attempt = 0; ; attempt++) {
    const built = await makeTx().build({ client });
    const { signature } = await signer.signTransaction(built);
    try {
      return await client.executeTransaction({
        transaction: built,
        signatures: [signature],
        include: { effects: true },
      });
    } catch (err) {
      const msg = decodeURIComponent(
        String(err instanceof Error ? err.message : err),
      );
      const stale =
        /unavailable for consumption|needs to be rebuilt|not available for consumption/i.test(
          msg,
        );
      if (!stale || attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}

describe("echo e2e flow", () => {
  let packageId: string;
  let formId: string;
  let formOwnerCapId: string;

  const admin = inject("adminAccount");
  // inject() returns a JSON-serialized snapshot — Ed25519Keypair's
  // methods don't survive. Rebuild the keypair from the bech32 secret
  // string so we can sign transactions locally in tests.
  const adminKeypair = loadAccountKeypair(admin);
  const localnetPort = inject("localnetPort");
  const suiClient = new SuiGrpcClient({
    network: "localnet",
    baseUrl: `http://localhost:${localnetPort}`,
  });

  it("publishes the echo package", () => {
    const objectChanges = inject("objectChanges");
    const pkg = objectChanges.find(
      ({ outputState }) => outputState === "PackageWrite",
    );
    expect(pkg).toBeDefined();
    packageId = pkg!.objectId;
    expect(packageId).toMatch(/^0x[0-9a-f]+$/);
  });

  it("creates a public form", async () => {
    const tx = new Transaction();
    const cap = tx.moveCall({
      target: `${packageId}::form::create_form`,
      arguments: [
        tx.pure.string("schema-blob-test"),
        tx.pure.string("metadata-blob-test"),
        tx.pure.u8(0), // Public
        tx.pure.u8(0),
        tx.pure.u8(0),
        tx.pure.u64(0n),
        tx.pure.string(""),
        // extra_admins: vector<address>. Empty for single-admin (sender)
        // public forms; tests for multi-admin minting live in the Move
        // unit tests under move/echo/tests/.
        tx.pure.vector("address", []),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    tx.transferObjects([cap], tx.pure.address(admin.address));
    tx.setSender(admin.address);

    const built = await tx.build({ client: suiClient });
    const { signature } = await adminKeypair.signTransaction(built);
    const resp = await suiClient.executeTransaction({
      transaction: built,
      signatures: [signature],
      include: { effects: true },
    });
    expect(resp.FailedTransaction).toBeUndefined();
    if (!resp.Transaction) throw new Error("expected successful tx");

    const created = resp.Transaction.effects.changedObjects.filter(
      (c) => c.idOperation === "Created",
    );
    const sharedForm = created.find((c) => c.outputOwner?.$kind === "Shared");
    const ownedCap = created.find(
      (c) => c.outputOwner?.$kind === "AddressOwner",
    );
    expect(sharedForm).toBeDefined();
    expect(ownedCap).toBeDefined();
    formId = sharedForm!.objectId;
    formOwnerCapId = ownedCap!.objectId;

    // Block until the GRPC node has indexed both objects so the next
    // test's tx.object() resolution doesn't 404.
    await waitForObjects(suiClient, [formId, formOwnerCapId]);
  });

  it("FormOwnerCap can close its own form", async () => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::form::close_form`,
      arguments: [tx.object(formOwnerCapId), tx.object(formId)],
    });
    tx.setSender(admin.address);

    const built = await tx.build({ client: suiClient });
    const { signature } = await adminKeypair.signTransaction(built);
    const resp = await suiClient.executeTransaction({
      transaction: built,
      signatures: [signature],
      include: { effects: true },
    });
    expect(resp.FailedTransaction).toBeUndefined();
    // close_form mutates form's version — give the indexer a beat to
    // catch up before the next test reads it.
    await waitForObjects(suiClient, [formId]);
  });

  it("rejects submit on a closed form", async () => {
    // close_form (previous test) bumped the shared form's version; the
    // GRPC index may still serve the old one. buildSignExecuteWithRetry
    // rebuilds against the current version until validators accept it,
    // so the only remaining failure is the Move abort we're asserting.
    const resp = await buildSignExecuteWithRetry(
      suiClient,
      adminKeypair,
      () => {
        const tx = new Transaction();
        tx.moveCall({
          target: `${packageId}::submission::submit`,
          arguments: [
            tx.object(formId),
            tx.pure.string("payload-blob-test"),
            tx.pure.u8(0), // tier_hint = Public — matches form.privacy_tier
            tx.object(SUI_CLOCK_OBJECT_ID),
          ],
        });
        tx.setSender(admin.address);
        return tx;
      },
    );
    // form::EFormNotOpen (abort 1) — submission must fail.
    expect(resp.FailedTransaction).toBeDefined();
  });
});
