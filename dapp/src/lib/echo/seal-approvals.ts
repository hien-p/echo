/**
 * Real m-of-n threshold via ApprovalWitness.
 *
 * Flow per decrypt:
 *   1. Each cap-holding admin runs `buildPostApprovalTx` → posts a shared
 *      ApprovalWitness object on chain referencing the exact Seal identity.
 *      Move's `post_approval` enforces cap+tier+identity match.
 *   2. Anyone (admin or not) calls `listApprovals` to discover witness ids
 *      for a given form/identity via the `ApprovalPosted` event index.
 *   3. Once `k` unique-signer witnesses exist, anyone calls
 *      `buildSealApproveThresholdMofNTxBytes` → builds the dry-run PTB the
 *      Seal key servers verify. They release shares; client decrypts.
 *
 * Caveat: witnesses live forever — this is "k of n voted to release once",
 * not "k of n required for every read". UI must communicate that clearly.
 */

import { Transaction } from "@mysten/sui/transactions";
import { SUI_CLOCK_OBJECT_ID } from "@mysten/sui/utils";
import type { ClientWithExtensions, CoreClient } from "@mysten/sui/client";

type SealCompatibleSuiClient = ClientWithExtensions<{ core: CoreClient }>;

export interface BuildPostApprovalArgs {
  packageId: string;
  formOwnerCapId: string;
  formId: string;
  identity: Uint8Array;
}

/** Real-tx PTB an admin signs to post one ApprovalWitness for `identity`. */
export function buildPostApprovalTx(args: BuildPostApprovalArgs): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${args.packageId}::form::post_approval`,
    arguments: [
      tx.object(args.formOwnerCapId),
      tx.object(args.formId),
      tx.pure.vector("u8", Array.from(args.identity)),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

export interface ApprovalRecord {
  witnessId: string;
  signer: string;
  identityHash: string; // hex
  createdMs: number;
}

/**
 * Discover ApprovalWitness objects for a form via the ApprovalPosted event
 * index. We skip per-identity filtering on the client because for the
 * Threshold tier the canonical Seal identity is fully derived from
 * (formId, tier byte) — every approval for this form targets the same
 * identity. Move's `seal_approve_threshold_m_of_n` enforces identity
 * equality on chain, so a forged witness with a wrong identity would just
 * fail the dry-run.
 *
 * Returns deduped-by-signer rows (latest witness per signer wins) so the
 * caller can build the seal_approve PTB without worrying about dup signers.
 */
export async function listApprovals(args: {
  fullnodeUrl: string;
  packageId: string;
  formId: string;
}): Promise<ApprovalRecord[]> {
  const eventType = `${args.packageId}::form::ApprovalPosted`;
  const events = await queryEventsByFormId(
    args.fullnodeUrl,
    eventType,
    args.formId,
  );
  const matched: ApprovalRecord[] = events.map((e) => ({
    witnessId: e.witness_id,
    signer: e.signer,
    identityHash: bytesArrayToHex(e.identity_hash),
    createdMs: Number(e.created_ms),
  }));
  // Dedupe by signer — keep latest.
  matched.sort((a, b) => b.createdMs - a.createdMs);
  const seen = new Set<string>();
  const out: ApprovalRecord[] = [];
  for (const r of matched) {
    const key = r.signer.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

export interface BuildThresholdMofNArgs {
  packageId: string;
  formId: string;
  identity: Uint8Array;
  /** Witness object IDs collected via listApprovals. Order doesn't matter;
   *  Move asserts unique signers internally. */
  witnessIds: string[];
  suiClient: SealCompatibleSuiClient;
  /** Wallet address that will be marked as sender for the kind-only build.
   *  Required because the call references shared objects (witnesses) that
   *  the SDK pre-flights against the sender. */
  senderAddress: string;
}

/** Kind-only PTB bytes for `seal_approve_threshold_m_of_n`, as expected by
 *  Seal's fetchKeys. Move consumes the witnesses in dry-run; this is fine
 *  because dry-run doesn't persist mutations. */
export async function buildSealApproveThresholdMofNTxBytes(
  args: BuildThresholdMofNArgs,
): Promise<Uint8Array> {
  if (args.witnessIds.length === 0) {
    throw new Error("No ApprovalWitness IDs supplied — cannot build PTB.");
  }
  const tx = new Transaction();
  const idArg = tx.pure.vector("u8", Array.from(args.identity));
  const witnessRefs = args.witnessIds.map((id) => tx.object(id));
  const approvalsArg = tx.makeMoveVec({
    type: `${args.packageId}::form::ApprovalWitness`,
    elements: witnessRefs,
  });
  tx.moveCall({
    target: `${args.packageId}::form::seal_approve_threshold_m_of_n`,
    arguments: [idArg, tx.object(args.formId), approvalsArg],
  });
  tx.setSender(args.senderAddress);
  return tx.build({ client: args.suiClient, onlyTransactionKind: true });
}

// ---- internals ----------------------------------------------------------

interface ApprovalPostedEvent {
  form_id: string;
  identity_hash: number[]; // u8 vector
  signer: string;
  witness_id: string;
  created_ms: string;
}

async function queryEventsByFormId(
  fullnodeUrl: string,
  moveEventType: string,
  formId: string,
): Promise<ApprovalPostedEvent[]> {
  // Try the targeted server-side filter first; fall back to type-only
  // global scan if the RPC rejects the All+MoveEventField combination.
  try {
    const resp = await fetch(fullnodeUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "suix_queryEvents",
        params: [
          {
            All: [
              { MoveEventType: moveEventType },
              { MoveEventField: { path: "/form_id", value: formId } },
            ],
          },
          null,
          200,
          true,
        ],
      }),
    });
    const data = (await resp.json()) as {
      result?: { data?: Array<{ parsedJson?: ApprovalPostedEvent }> };
      error?: unknown;
    };
    if (data.error) throw new Error(JSON.stringify(data.error));
    return (data.result?.data ?? [])
      .map((e) => e.parsedJson)
      .filter((p): p is ApprovalPostedEvent => !!p);
  } catch {
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
      result?: { data?: Array<{ parsedJson?: ApprovalPostedEvent }> };
    };
    return (data.result?.data ?? [])
      .map((e) => e.parsedJson)
      .filter((p): p is ApprovalPostedEvent => !!p && p.form_id === formId);
  }
}

function bytesArrayToHex(arr: number[]): string {
  let hex = "";
  for (const b of arr) hex += (b & 0xff).toString(16).padStart(2, "0");
  return hex;
}

/** Convenience: hex-encode a Uint8Array (no 0x prefix). */
export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}
