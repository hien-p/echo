/// Echo — Form module.
///
/// On-chain anchor for a feedback form. The schema and metadata themselves
/// live on Walrus; this object holds blob IDs, owner, privacy tier, and
/// lifecycle state. Capability `FormOwnerCap` proves ownership and gates
/// schema updates, status changes, and reputation crediting.
module echo::form;

use std::string::String;
use sui::{clock::Clock, event, table::{Self, Table}};

// Privacy tier codes — frontend passes the matching tier-specific params,
// the rest are zeroed/empty.
const PRIVACY_PUBLIC: u8 = 0;
const PRIVACY_ADMIN_ONLY: u8 = 1;
const PRIVACY_THRESHOLD: u8 = 2;
const PRIVACY_TIME_LOCKED: u8 = 3;
const PRIVACY_CONDITIONAL: u8 = 4;

const STATUS_OPEN: u8 = 1;
const STATUS_CLOSED: u8 = 2;
const STATUS_ARCHIVED: u8 = 3;

const EInvalidPrivacyTier: u64 = 0;
const EFormNotOpen: u64 = 1;
const EWrongOwnerCap: u64 = 2;
const EThresholdInvalid: u64 = 3;
const ESealIdMismatch: u64 = 4;
const ENotYetUnlocked: u64 = 5;
const EWrongTier: u64 = 6;
const ECommitmentAlreadyUsed: u64 = 7;
const EInsufficientApprovals: u64 = 8;
const EWrongFormId: u64 = 9;
const EWrongIdentity: u64 = 10;
const EDuplicateSigner: u64 = 11;
const EUnlockInPast: u64 = 12;
const EFormArchived: u64 = 13;
const EApprovalExpired: u64 = 14;
const EApprovalTtlInvalid: u64 = 15;

/// Upper bound on an approval witness's lifetime: 7 days in ms. Bounds
/// the F-01 blast radius — a k-of-n quorum's witnesses can re-pass the
/// Seal dry-run only until they expire, after which admins must re-post.
const MAX_APPROVAL_TTL_MS: u64 = 7 * 24 * 60 * 60 * 1000;

public struct Form has key {
  id: UID,
  schema_blob_id: String,
  schema_version: u64,
  metadata_blob_id: String,
  owner: address,
  privacy_tier: u8,
  threshold_n: u8,
  threshold_m: u8,
  unlock_ms: u64,
  conditional_policy_id: String,
  status: u8,
  submission_count: u64,
  created_ms: u64,
  /// Used commitments for anonymous submissions. Per (wallet, form) the
  /// nullifier is deterministic, so this table is the on-chain proof that
  /// a wallet already submitted, without revealing which wallet.
  commitments_used: Table<vector<u8>, bool>,
}

public struct FormOwnerCap has key, store {
  id: UID,
  form_id: ID,
}

public struct FormCreated has copy, drop {
  form_id: ID,
  owner: address,
  privacy_tier: u8,
}

public struct FormSchemaUpdated has copy, drop {
  form_id: ID,
  new_version: u64,
}

public struct FormStatusChanged has copy, drop {
  form_id: ID,
  new_status: u8,
}

public fun create_form(
  schema_blob_id: String,
  metadata_blob_id: String,
  privacy_tier: u8,
  threshold_n: u8,
  threshold_m: u8,
  unlock_ms: u64,
  conditional_policy_id: String,
  // Extra cap recipients beyond the sender. Empty for AdminOnly /
  // single-admin forms; non-empty for OR-of-N multi-admin forms where
  // each address gets its own FormOwnerCap and any one can decrypt
  // or manage the form. The sender always gets one cap as the return.
  extra_admins: vector<address>,
  clock: &Clock,
  ctx: &mut TxContext,
): FormOwnerCap {
  assert!(privacy_tier <= PRIVACY_CONDITIONAL, EInvalidPrivacyTier);
  if (privacy_tier == PRIVACY_THRESHOLD) {
    assert!(threshold_n > 0 && threshold_n <= threshold_m, EThresholdInvalid);
  };
  if (privacy_tier == PRIVACY_TIME_LOCKED) {
    assert!(unlock_ms > clock.timestamp_ms(), EUnlockInPast);
  };

  let form = Form {
    id: object::new(ctx),
    schema_blob_id,
    schema_version: 1,
    metadata_blob_id,
    owner: ctx.sender(),
    privacy_tier,
    threshold_n,
    threshold_m,
    unlock_ms,
    conditional_policy_id,
    status: STATUS_OPEN,
    submission_count: 0,
    created_ms: clock.timestamp_ms(),
    commitments_used: table::new<vector<u8>, bool>(ctx),
  };
  let form_id = object::id(&form);
  let cap = FormOwnerCap {
    id: object::new(ctx),
    form_id,
  };

  // Mint and distribute one cap per extra admin. The sender's own cap is
  // returned by this function so the caller can chain transferObjects on it.
  let mut i = 0;
  let n = vector::length(&extra_admins);
  while (i < n) {
    let recipient = *vector::borrow(&extra_admins, i);
    let extra_cap = FormOwnerCap {
      id: object::new(ctx),
      form_id,
    };
    transfer::transfer(extra_cap, recipient);
    i = i + 1;
  };

  event::emit(FormCreated {
    form_id,
    owner: ctx.sender(),
    privacy_tier,
  });

  transfer::share_object(form);
  cap
}

fun assert_owns(cap: &FormOwnerCap, form: &Form) {
  assert!(cap.form_id == object::id(form), EWrongOwnerCap);
}

public fun update_schema(
  cap: &FormOwnerCap,
  form: &mut Form,
  new_blob_id: String,
) {
  assert_owns(cap, form);
  form.schema_blob_id = new_blob_id;
  form.schema_version = form.schema_version + 1;
  event::emit(FormSchemaUpdated {
    form_id: object::id(form),
    new_version: form.schema_version,
  });
}

public fun update_metadata(
  cap: &FormOwnerCap,
  form: &mut Form,
  new_blob_id: String,
) {
  assert_owns(cap, form);
  form.metadata_blob_id = new_blob_id;
}

public fun close_form(cap: &FormOwnerCap, form: &mut Form) {
  assert_owns(cap, form);
  form.status = STATUS_CLOSED;
  event::emit(FormStatusChanged {
    form_id: object::id(form),
    new_status: STATUS_CLOSED,
  });
}

public fun archive_form(cap: &FormOwnerCap, form: &mut Form) {
  assert_owns(cap, form);
  form.status = STATUS_ARCHIVED;
  event::emit(FormStatusChanged {
    form_id: object::id(form),
    new_status: STATUS_ARCHIVED,
  });
}

/// Record a nullifier commitment as used. Aborts with ECommitmentAlreadyUsed
/// if the commitment was already submitted before. Called by submission::
/// submit_anonymous so that one wallet/form pair can submit at most once
/// even when the wallet's address is hidden from the chain.
public(package) fun record_commitment(form: &mut Form, c: vector<u8>) {
  assert!(form.status == STATUS_OPEN, EFormNotOpen);
  assert!(!table::contains(&form.commitments_used, c), ECommitmentAlreadyUsed);
  table::add(&mut form.commitments_used, c, true);
}

public fun commitment_used(form: &Form, c: vector<u8>): bool {
  table::contains(&form.commitments_used, c)
}

public(package) fun bump_submission_count(form: &mut Form) {
  assert!(form.status == STATUS_OPEN, EFormNotOpen);
  form.submission_count = form.submission_count + 1;
}

public(package) fun assert_open(form: &Form) {
  assert!(form.status == STATUS_OPEN, EFormNotOpen);
}

/// Archived forms are sealed — Seal approvals must abort. Closed forms remain
/// readable so admins can still triage submissions received before closure;
/// archive is the "stop reading" signal. See F-03 in the security audit.
fun assert_not_archived(form: &Form) {
  assert!(form.status != STATUS_ARCHIVED, EFormArchived);
}

// ============================================================================
// Seal access-control approvals.
//
// Seal key servers run these as a dry-run PTB and release decryption shares
// only when the call returns successfully (no abort). The first arg is the
// encryption identity bytes — we require it to start with the form's object
// id so a single approval can't leak shares for a different form's tier.
// ============================================================================

/// Bytes prefix length we expect: 32-byte form id + 1 tier byte.
const SEAL_ID_MIN_LEN: u64 = 33;

/// Helper: compare form id bytes against the leading 32 bytes of `id`.
fun seal_id_matches_form(id: &vector<u8>, form: &Form): bool {
  if (vector::length(id) < SEAL_ID_MIN_LEN) return false;
  let form_bytes = object::id_to_bytes(&object::id(form));
  let mut i = 0;
  while (i < 32) {
    if (*vector::borrow(id, i) != *vector::borrow(&form_bytes, i)) return false;
    i = i + 1;
  };
  true
}

/// Admin-only tier: caller must hold the matching FormOwnerCap.
public fun seal_approve_admin_only(
  id: vector<u8>,
  form: &Form,
  cap: &FormOwnerCap,
) {
  assert!(seal_id_matches_form(&id, form), ESealIdMismatch);
  assert!(form.privacy_tier == PRIVACY_ADMIN_ONLY, EWrongTier);
  assert!(cap.form_id == object::id(form), EWrongOwnerCap);
  assert_not_archived(form);
}

/// Threshold tier — OR-of-N path. Any single cap holder approves decryption.
/// Used when threshold_n == 1 (single required approval). For real m-of-n
/// (k >= 2), use post_approval + seal_approve_threshold_m_of_n instead.
public fun seal_approve_threshold(
  id: vector<u8>,
  form: &Form,
  cap: &FormOwnerCap,
) {
  assert!(seal_id_matches_form(&id, form), ESealIdMismatch);
  assert!(form.privacy_tier == PRIVACY_THRESHOLD, EWrongTier);
  // F-02: this entry is the 1-of-N (OR-of-N) path only. Real k>=2 forms must
  // go through seal_approve_threshold_m_of_n with k witnesses. Without this
  // assert, a single rogue cap holder bypasses the entire m-of-n policy.
  assert!(form.threshold_n == 1, EThresholdInvalid);
  assert!(cap.form_id == object::id(form), EWrongOwnerCap);
  assert_not_archived(form);
}

// ============================================================================
// Real m-of-n threshold via ApprovalWitness pattern.
//
// Each admin posts an ApprovalWitness object (shared) approving a specific
// Seal identity. seal_approve_threshold_m_of_n then takes a vector of those
// witnesses and asserts that at least `threshold_n` unique signers (each
// holding a cap) approved this exact identity. Witnesses carry an
// `expires_ms`: a k-of-n quorum re-passes the Seal dry-run only until the
// freshest-bounded witness expires (F-01 mitigation), after which admins
// must re-post. Semantics is "k of n voted to release this data, valid
// until expiry" not "k of n required for every read". UI must communicate
// both the quorum and the expiry window.
// ============================================================================

public struct ApprovalWitness has key, store {
  id: UID,
  form_id: ID,
  /// Exact Seal identity bytes being approved — formId || tierByte || extra.
  identity: vector<u8>,
  signer: address,
  created_ms: u64,
  /// Witness no longer passes seal_approve_threshold_m_of_n once
  /// clock.timestamp_ms() >= this. Set to created_ms + ttl_ms at post.
  expires_ms: u64,
}

public struct ApprovalPosted has copy, drop {
  form_id: ID,
  /// keccak256(identity); 32 bytes. Lets indexers filter without storing
  /// the full identity payload in the event.
  identity_hash: vector<u8>,
  signer: address,
  witness_id: ID,
  created_ms: u64,
  /// Lets clients drop expired witnesses without an extra object read.
  expires_ms: u64,
}

/// Mint a shared ApprovalWitness recording that this cap holder approves
/// decryption of `identity` for this form. Caller must hold a matching cap;
/// form must be in the Threshold tier; identity must reference this form.
/// Witness object id is emitted on the ApprovalPosted event so anyone can
/// discover the set of approvals for a given form/identity pair.
public fun post_approval(
  cap: &FormOwnerCap,
  form: &Form,
  identity: vector<u8>,
  ttl_ms: u64,
  clock: &sui::clock::Clock,
  ctx: &mut TxContext,
) {
  assert!(cap.form_id == object::id(form), EWrongOwnerCap);
  assert!(form.privacy_tier == PRIVACY_THRESHOLD, EWrongTier);
  assert!(seal_id_matches_form(&identity, form), ESealIdMismatch);
  assert_not_archived(form);
  assert!(ttl_ms > 0 && ttl_ms <= MAX_APPROVAL_TTL_MS, EApprovalTtlInvalid);

  let signer = ctx.sender();
  let form_id_inner = object::id(form);
  let now = clock.timestamp_ms();
  let expires_ms = now + ttl_ms;
  let identity_hash = sui::hash::keccak256(&identity);

  let uid = object::new(ctx);
  let witness_id = uid.to_inner();
  let w = ApprovalWitness {
    id: uid,
    form_id: form_id_inner,
    identity,
    signer,
    created_ms: now,
    expires_ms,
  };

  event::emit(ApprovalPosted {
    form_id: form_id_inner,
    identity_hash,
    signer,
    witness_id,
    created_ms: now,
    expires_ms,
  });

  transfer::share_object(w);
}

/// Real m-of-n: takes k+ ApprovalWitness objects. Asserts (a) at least
/// `threshold_n` witnesses present, (b) every witness binds to this form,
/// (c) every witness binds to the exact `id`, (d) signers are all distinct,
/// (e) no witness has expired (clock < expires_ms). Witnesses are consumed;
/// in Seal's dry-run this is a no-op (state never persists), so the same
/// set re-decrypts — but only until the soonest witness expiry. After that
/// admins must re-post (F-01 mitigation — see file header).
public fun seal_approve_threshold_m_of_n(
  id: vector<u8>,
  form: &Form,
  mut approvals: vector<ApprovalWitness>,
  clock: &sui::clock::Clock,
) {
  assert!(seal_id_matches_form(&id, form), ESealIdMismatch);
  assert!(form.privacy_tier == PRIVACY_THRESHOLD, EWrongTier);
  assert_not_archived(form);

  let required = (form.threshold_n as u64);
  let n = vector::length(&approvals);
  assert!(n >= required, EInsufficientApprovals);

  let now = clock.timestamp_ms();
  let mut seen = sui::vec_set::empty<address>();
  let form_id_inner = object::id(form);
  let mut i = 0;
  while (i < n) {
    let w = vector::borrow(&approvals, i);
    assert!(w.form_id == form_id_inner, EWrongFormId);
    assert!(&w.identity == &id, EWrongIdentity);
    assert!(!sui::vec_set::contains(&seen, &w.signer), EDuplicateSigner);
    assert!(now < w.expires_ms, EApprovalExpired);
    sui::vec_set::insert(&mut seen, w.signer);
    i = i + 1;
  };

  while (!vector::is_empty(&approvals)) {
    let ApprovalWitness {
      id: uid,
      form_id: _,
      identity: _,
      signer: _,
      created_ms: _,
      expires_ms: _,
    } = vector::pop_back(&mut approvals);
    object::delete(uid);
  };
  vector::destroy_empty(approvals);
}

/// Time-locked tier: any caller can decrypt once the unlock timestamp passes.
public fun seal_approve_time_locked(
  id: vector<u8>,
  form: &Form,
  clock: &sui::clock::Clock,
) {
  assert!(seal_id_matches_form(&id, form), ESealIdMismatch);
  assert!(form.privacy_tier == PRIVACY_TIME_LOCKED, EWrongTier);
  assert!(clock.timestamp_ms() >= form.unlock_ms, ENotYetUnlocked);
  assert_not_archived(form);
}

/// Conditional tier: caller must hold the FormOwnerCap (the off-chain policy
/// implementation can extend this with an additional witness object). Kept
/// minimal here so the privacy contract compiles end-to-end.
public fun seal_approve_conditional(
  id: vector<u8>,
  form: &Form,
  cap: &FormOwnerCap,
) {
  assert!(seal_id_matches_form(&id, form), ESealIdMismatch);
  assert!(form.privacy_tier == PRIVACY_CONDITIONAL, EWrongTier);
  assert!(cap.form_id == object::id(form), EWrongOwnerCap);
  assert_not_archived(form);
}

public fun id(form: &Form): ID { object::id(form) }

public fun owner(form: &Form): address { form.owner }

public fun schema_blob_id(form: &Form): String { form.schema_blob_id }

public fun schema_version(form: &Form): u64 { form.schema_version }

public fun privacy_tier(form: &Form): u8 { form.privacy_tier }

public fun status(form: &Form): u8 { form.status }

public fun submission_count(form: &Form): u64 { form.submission_count }

public fun unlock_ms(form: &Form): u64 { form.unlock_ms }

public fun threshold(form: &Form): (u8, u8) {
  (form.threshold_n, form.threshold_m)
}

public fun cap_form_id(cap: &FormOwnerCap): ID { cap.form_id }

public fun witness_signer(w: &ApprovalWitness): address { w.signer }

public fun witness_form_id(w: &ApprovalWitness): ID { w.form_id }

public fun witness_created_ms(w: &ApprovalWitness): u64 { w.created_ms }

public fun witness_expires_ms(w: &ApprovalWitness): u64 { w.expires_ms }

public fun privacy_public(): u8 { PRIVACY_PUBLIC }

public fun privacy_admin_only(): u8 { PRIVACY_ADMIN_ONLY }

public fun privacy_threshold(): u8 { PRIVACY_THRESHOLD }

public fun privacy_time_locked(): u8 { PRIVACY_TIME_LOCKED }

public fun privacy_conditional(): u8 { PRIVACY_CONDITIONAL }

public fun status_open(): u8 { STATUS_OPEN }

public fun status_closed(): u8 { STATUS_CLOSED }

public fun status_archived(): u8 { STATUS_ARCHIVED }
