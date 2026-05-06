/// Echo — Form module.
///
/// On-chain anchor for a feedback form. The schema and metadata themselves
/// live on Walrus; this object holds blob IDs, owner, privacy tier, and
/// lifecycle state. Capability `FormOwnerCap` proves ownership and gates
/// schema updates, status changes, and reputation crediting.
module echo::form;

use std::string::String;
use sui::{clock::Clock, event};

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
  clock: &Clock,
  ctx: &mut TxContext,
): FormOwnerCap {
  assert!(privacy_tier <= PRIVACY_CONDITIONAL, EInvalidPrivacyTier);
  if (privacy_tier == PRIVACY_THRESHOLD) {
    assert!(threshold_n > 0 && threshold_n <= threshold_m, EThresholdInvalid);
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
  };
  let form_id = object::id(&form);
  let cap = FormOwnerCap {
    id: object::new(ctx),
    form_id,
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

public(package) fun bump_submission_count(form: &mut Form) {
  form.submission_count = form.submission_count + 1;
}

public(package) fun assert_open(form: &Form) {
  assert!(form.status == STATUS_OPEN, EFormNotOpen);
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

public fun privacy_public(): u8 { PRIVACY_PUBLIC }

public fun privacy_admin_only(): u8 { PRIVACY_ADMIN_ONLY }

public fun privacy_threshold(): u8 { PRIVACY_THRESHOLD }

public fun privacy_time_locked(): u8 { PRIVACY_TIME_LOCKED }

public fun privacy_conditional(): u8 { PRIVACY_CONDITIONAL }

public fun status_open(): u8 { STATUS_OPEN }

public fun status_closed(): u8 { STATUS_CLOSED }

public fun status_archived(): u8 { STATUS_ARCHIVED }
