/**
 * Sui transaction builders for Echo Move calls.
 *
 * These build `Transaction` objects only — signing and execution happens
 * upstream via dApp Kit's `signAndExecuteTransaction`. Each builder takes
 * the package id explicitly so callers stay decoupled from the env config.
 */

import { Transaction } from "@mysten/sui/transactions";
import { SUI_CLOCK_OBJECT_ID } from "@mysten/sui/utils";
import { PrivacyTier } from "./types";

export interface CreateFormArgs {
  packageId: string;
  /** Connected wallet address — receives the FormOwnerCap. */
  senderAddress: string;
  schemaBlobId: string;
  metadataBlobId: string;
  privacyTier: PrivacyTier;
  thresholdN?: number;
  thresholdM?: number;
  unlockMs?: bigint;
  conditionalPolicyId?: string;
  /**
   * Optional co-admin addresses for OR-of-N forms. Each address gets its
   * own FormOwnerCap minted by Move and `transfer::transfer`'d directly
   * (no PTB-side transferObjects needed). Empty/undefined for single-admin
   * forms — the sender alone receives a cap.
   */
  extraAdmins?: string[];
}

export function buildCreateFormTx(args: CreateFormArgs): Transaction {
  const tx = new Transaction();
  const extraAdmins = (args.extraAdmins ?? []).filter(
    (a) =>
      a.startsWith("0x") &&
      a.toLowerCase() !== args.senderAddress.toLowerCase(),
  );
  const cap = tx.moveCall({
    target: `${args.packageId}::form::create_form`,
    arguments: [
      tx.pure.string(args.schemaBlobId),
      tx.pure.string(args.metadataBlobId),
      tx.pure.u8(args.privacyTier),
      tx.pure.u8(args.thresholdN ?? 0),
      tx.pure.u8(args.thresholdM ?? 0),
      tx.pure.u64(args.unlockMs ?? BigInt(0)),
      tx.pure.string(args.conditionalPolicyId ?? ""),
      tx.pure.vector("address", extraAdmins),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  tx.transferObjects([cap], tx.pure.address(args.senderAddress));
  return tx;
}

export interface SubmitArgs {
  packageId: string;
  formId: string;
  payloadBlobId: string;
}

export function buildSubmitTx(args: SubmitArgs): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${args.packageId}::submission::submit`,
    arguments: [
      tx.object(args.formId),
      tx.pure.string(args.payloadBlobId),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

export interface SubmitAnonymousArgs extends SubmitArgs {
  /** 32-byte commitment hash — derived from the submitter's secret nullifier. */
  commitment: Uint8Array;
}

export function buildSubmitAnonymousTx(args: SubmitAnonymousArgs): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${args.packageId}::submission::submit_anonymous`,
    arguments: [
      tx.object(args.formId),
      tx.pure.string(args.payloadBlobId),
      tx.pure.vector("u8", Array.from(args.commitment)),
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

export interface UpdateSchemaArgs {
  packageId: string;
  formOwnerCapId: string;
  formId: string;
  newSchemaBlobId: string;
}

export function buildUpdateSchemaTx(args: UpdateSchemaArgs): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${args.packageId}::form::update_schema`,
    arguments: [
      tx.object(args.formOwnerCapId),
      tx.object(args.formId),
      tx.pure.string(args.newSchemaBlobId),
    ],
  });
  return tx;
}

export interface CloseFormArgs {
  packageId: string;
  formOwnerCapId: string;
  formId: string;
}

export function buildCloseFormTx(args: CloseFormArgs): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${args.packageId}::form::close_form`,
    arguments: [tx.object(args.formOwnerCapId), tx.object(args.formId)],
  });
  return tx;
}

export function buildArchiveFormTx(args: CloseFormArgs): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${args.packageId}::form::archive_form`,
    arguments: [tx.object(args.formOwnerCapId), tx.object(args.formId)],
  });
  return tx;
}

export function buildMintReputationTx(args: {
  packageId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({ target: `${args.packageId}::reputation::mint`, arguments: [] });
  return tx;
}

export function buildIssueCreditTx(args: {
  packageId: string;
  formOwnerCapId: string;
  recipient: string;
  scoreDelta: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${args.packageId}::reputation::issue_credit`,
    arguments: [
      tx.object(args.formOwnerCapId),
      tx.pure.address(args.recipient),
      tx.pure.u64(args.scoreDelta),
    ],
  });
  return tx;
}

export function buildClaimCreditTx(args: {
  packageId: string;
  ticketId: string;
  reputationId: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${args.packageId}::reputation::claim_credit`,
    arguments: [tx.object(args.ticketId), tx.object(args.reputationId)],
  });
  return tx;
}

export function buildCreateBountyTx(args: {
  packageId: string;
  formOwnerCapId: string;
  amountMist: bigint;
  mode: number;
}): Transaction {
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(args.amountMist)]);
  tx.moveCall({
    target: `${args.packageId}::bounty::create_bounty`,
    arguments: [tx.object(args.formOwnerCapId), coin, tx.pure.u8(args.mode)],
  });
  return tx;
}

export function buildAddBountyFundsTx(args: {
  packageId: string;
  poolId: string;
  amountMist: bigint;
}): Transaction {
  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(args.amountMist)]);
  tx.moveCall({
    target: `${args.packageId}::bounty::add_funds`,
    arguments: [tx.object(args.poolId), coin],
  });
  return tx;
}

export function buildBountyPayoutTx(args: {
  packageId: string;
  formOwnerCapId: string;
  poolId: string;
  recipient: string;
  amountMist: bigint;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${args.packageId}::bounty::payout_to`,
    arguments: [
      tx.object(args.formOwnerCapId),
      tx.object(args.poolId),
      tx.pure.address(args.recipient),
      tx.pure.u64(args.amountMist),
    ],
  });
  return tx;
}

export function buildCloseBountyTx(args: {
  packageId: string;
  formOwnerCapId: string;
  poolId: string;
  refundRecipient: string;
}): Transaction {
  const tx = new Transaction();
  const refund = tx.moveCall({
    target: `${args.packageId}::bounty::close_bounty`,
    arguments: [tx.object(args.formOwnerCapId), tx.object(args.poolId)],
  });
  tx.transferObjects([refund], tx.pure.address(args.refundRecipient));
  return tx;
}
