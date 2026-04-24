import { serverConfig } from "@/config/serverConfig";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64 } from "@mysten/sui/utils";
import { suiClient } from "../suiClient";
import { NextResponse } from "next/server";

export const revalidate = 1;

/**
 * @swagger
 * /api/increment:
 *   post:
 *     summary: Increment the counter
 *     description: Increments the counter value by 1 on the Sui blockchain
 *     tags: [Counter]
 *     responses:
 *       200:
 *         description: Counter incremented successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/IncrementResponse"
 *       500:
 *         description: Transaction failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 */
export const POST = async () => {
  const privKeyArray = Uint8Array.from(
    Array.from(fromBase64(serverConfig.ADMIN_SECRET_KEY)),
  );
  const keypair = Ed25519Keypair.fromSecretKey(
    Uint8Array.from(privKeyArray).slice(1),
  );
  const tx = new Transaction();
  tx.moveCall({
    target: `${serverConfig.PACKAGE_ID}::counter::increment`,
    arguments: [tx.object(serverConfig.COUNTER_ID)],
  });
  const { effects } = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showEffects: true },
  });

  if (effects?.status.status === "success") {
    return NextResponse.json({
      success: true,
      digest: effects.transactionDigest,
    });
  }
  return NextResponse.json({ effects }, { status: 500 });
};
