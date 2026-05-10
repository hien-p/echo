import { describe, it, expect, inject } from "vitest";
import { Transaction } from "@mysten/sui/transactions";
import { SUI_CLOCK_OBJECT_ID } from "@mysten/sui/utils";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { loadAccountKeypair } from "../src/utils/getNewAccount";

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
  });

  it("rejects submit on a closed form", async () => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::submission::submit`,
      arguments: [
        tx.object(formId),
        tx.pure.string("payload-blob-test"),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    tx.setSender(admin.address);

    const built = await tx.build({ client: suiClient });
    const { signature } = await adminKeypair.signTransaction(built);
    const resp = await suiClient.executeTransaction({
      transaction: built,
      signatures: [signature],
      include: { effects: true },
    });
    // form::EFormNotOpen (abort 1) — submission must fail.
    expect(resp.FailedTransaction).toBeDefined();
  });
});
