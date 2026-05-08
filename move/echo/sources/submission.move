/// Echo — Submission module.
///
/// On-chain reference to a Walrus-stored response payload. For Public forms
/// the payload is plaintext; for Admin/Threshold/TimeLocked/Conditional tiers
/// it is Seal-encrypted off-chain before upload. The chain only records the
/// blob ID, the schema version it was submitted against, and the submitter
/// (or commitment hash for anonymous mode).
module echo::submission;

use echo::form::{Self, Form};
use std::string::String;
use sui::{clock::Clock, event};

public struct SubmissionRef has key {
  id: UID,
  form_id: ID,
  payload_blob_id: String,
  schema_version: u64,
  /// `@0x0` when anonymous; otherwise sender address.
  submitter: address,
  /// 32-byte commitment for anonymous mode; empty otherwise.
  commitment: vector<u8>,
  submitted_ms: u64,
}

public struct SubmissionMade has copy, drop {
  form_id: ID,
  submission_id: ID,
  submitter: address,
  schema_version: u64,
  anonymous: bool,
}

public fun submit(
  form: &mut Form,
  payload_blob_id: String,
  clock: &Clock,
  ctx: &mut TxContext,
): ID {
  form::assert_open(form);
  let s = SubmissionRef {
    id: object::new(ctx),
    form_id: form::id(form),
    payload_blob_id,
    schema_version: form::schema_version(form),
    submitter: ctx.sender(),
    commitment: vector::empty<u8>(),
    submitted_ms: clock.timestamp_ms(),
  };
  let sid = object::id(&s);
  let form_id = form::id(form);
  let schema_version = s.schema_version;
  form::bump_submission_count(form);
  event::emit(SubmissionMade {
    form_id,
    submission_id: sid,
    submitter: ctx.sender(),
    schema_version,
    anonymous: false,
  });
  transfer::share_object(s);
  sid
}

public fun submit_anonymous(
  form: &mut Form,
  payload_blob_id: String,
  commitment: vector<u8>,
  clock: &Clock,
  ctx: &mut TxContext,
): ID {
  form::assert_open(form);
  // Aborts ECommitmentAlreadyUsed if this nullifier was already used.
  // Frontend derives the commitment deterministically from (wallet, form),
  // so the same wallet attempting a second anonymous submit gets rejected
  // without revealing which wallet the commitment maps to.
  form::record_commitment(form, commitment);
  let s = SubmissionRef {
    id: object::new(ctx),
    form_id: form::id(form),
    payload_blob_id,
    schema_version: form::schema_version(form),
    submitter: @0x0,
    commitment,
    submitted_ms: clock.timestamp_ms(),
  };
  let sid = object::id(&s);
  let form_id = form::id(form);
  let schema_version = s.schema_version;
  form::bump_submission_count(form);
  event::emit(SubmissionMade {
    form_id,
    submission_id: sid,
    submitter: @0x0,
    schema_version,
    anonymous: true,
  });
  transfer::share_object(s);
  sid
}

public fun form_id(s: &SubmissionRef): ID { s.form_id }

public fun payload_blob_id(s: &SubmissionRef): String { s.payload_blob_id }

public fun schema_version(s: &SubmissionRef): u64 { s.schema_version }

public fun submitter(s: &SubmissionRef): address { s.submitter }

public fun submitted_ms(s: &SubmissionRef): u64 { s.submitted_ms }

public fun commitment(s: &SubmissionRef): vector<u8> { s.commitment }
