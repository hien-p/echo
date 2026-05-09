#[test_only]
module echo::echo_tests;

use echo::{
  form::{Self, Form, FormOwnerCap, ApprovalWitness},
  submission::{Self, SubmissionRef}
};
use std::string;
use sui::{clock, test_scenario as ts};

const ADMIN: address = @0xA1;
const USER: address = @0xB2;

fun new_public_form_in_scenario(scenario: &mut ts::Scenario) {
  let ctx = ts::ctx(scenario);
  let clock = clock::create_for_testing(ctx);
  let cap = form::create_form(
    string::utf8(b"schema-blob"),
    string::utf8(b"metadata-blob"),
    form::privacy_public(),
    0,
    0,
    0,
    string::utf8(b""),
    vector::empty<address>(),
    &clock,
    ctx,
  );
  clock::destroy_for_testing(clock);
  transfer::public_transfer(cap, ADMIN);
}

#[test]
fun create_public_form_initial_state() {
  let mut scenario = ts::begin(ADMIN);
  new_public_form_in_scenario(&mut scenario);

  ts::next_tx(&mut scenario, ADMIN);
  let form = ts::take_shared<Form>(&scenario);
  assert!(form::status(&form) == form::status_open(), 0);
  assert!(form::privacy_tier(&form) == form::privacy_public(), 0);
  assert!(form::schema_version(&form) == 1, 0);
  assert!(form::submission_count(&form) == 0, 0);
  ts::return_shared(form);

  ts::end(scenario);
}

#[test]
fun submit_increments_count_and_records_submitter() {
  let mut scenario = ts::begin(ADMIN);
  new_public_form_in_scenario(&mut scenario);

  ts::next_tx(&mut scenario, USER);
  let mut form_obj = ts::take_shared<Form>(&scenario);
  let ctx = ts::ctx(&mut scenario);
  let clock = clock::create_for_testing(ctx);
  let _sid = submission::submit(
    &mut form_obj,
    string::utf8(b"payload-blob-1"),
    &clock,
    ctx,
  );
  clock::destroy_for_testing(clock);
  assert!(form::submission_count(&form_obj) == 1, 0);
  ts::return_shared(form_obj);

  ts::next_tx(&mut scenario, USER);
  let s = ts::take_shared<SubmissionRef>(&scenario);
  assert!(submission::submitter(&s) == USER, 0);
  assert!(submission::schema_version(&s) == 1, 0);
  ts::return_shared(s);

  ts::end(scenario);
}

#[test]
fun submit_anonymous_records_zero_address_and_commitment() {
  let mut scenario = ts::begin(ADMIN);
  new_public_form_in_scenario(&mut scenario);

  ts::next_tx(&mut scenario, USER);
  let mut form_obj = ts::take_shared<Form>(&scenario);
  let ctx = ts::ctx(&mut scenario);
  let clock = clock::create_for_testing(ctx);
  let commitment: vector<u8> = vector[1, 2, 3, 4];
  let _sid = submission::submit_anonymous(
    &mut form_obj,
    string::utf8(b"payload-anon"),
    commitment,
    &clock,
    ctx,
  );
  clock::destroy_for_testing(clock);
  ts::return_shared(form_obj);

  ts::next_tx(&mut scenario, USER);
  let s = ts::take_shared<SubmissionRef>(&scenario);
  assert!(submission::submitter(&s) == @0x0, 0);
  assert!(submission::commitment(&s) == vector[1, 2, 3, 4], 0);
  ts::return_shared(s);

  ts::end(scenario);
}

#[test]
fun update_schema_bumps_version() {
  let mut scenario = ts::begin(ADMIN);
  new_public_form_in_scenario(&mut scenario);

  ts::next_tx(&mut scenario, ADMIN);
  let cap = ts::take_from_sender<FormOwnerCap>(&scenario);
  let mut form_obj = ts::take_shared<Form>(&scenario);
  form::update_schema(&cap, &mut form_obj, string::utf8(b"schema-v2"));
  assert!(form::schema_version(&form_obj) == 2, 0);
  assert!(form::schema_blob_id(&form_obj) == string::utf8(b"schema-v2"), 0);
  ts::return_shared(form_obj);
  ts::return_to_sender(&scenario, cap);

  ts::end(scenario);
}

#[test, expected_failure(abort_code = 1, location = echo::form)]
fun submit_to_closed_form_aborts() {
  let mut scenario = ts::begin(ADMIN);
  new_public_form_in_scenario(&mut scenario);

  ts::next_tx(&mut scenario, ADMIN);
  let cap = ts::take_from_sender<FormOwnerCap>(&scenario);
  let mut form_obj = ts::take_shared<Form>(&scenario);
  form::close_form(&cap, &mut form_obj);
  assert!(form::status(&form_obj) == form::status_closed(), 0);
  ts::return_shared(form_obj);
  ts::return_to_sender(&scenario, cap);

  ts::next_tx(&mut scenario, USER);
  let mut form_obj = ts::take_shared<Form>(&scenario);
  let ctx = ts::ctx(&mut scenario);
  let clock = clock::create_for_testing(ctx);
  let _sid = submission::submit(
    &mut form_obj,
    string::utf8(b"should-fail"),
    &clock,
    ctx,
  );
  clock::destroy_for_testing(clock);
  ts::return_shared(form_obj);

  ts::end(scenario);
}

#[test]
fun seal_approve_admin_only_passes_with_matching_cap() {
  let mut scenario = ts::begin(ADMIN);
  // Create an admin-only form.
  {
    let ctx = ts::ctx(&mut scenario);
    let clock = clock::create_for_testing(ctx);
    let cap = form::create_form(
      string::utf8(b"s"),
      string::utf8(b"m"),
      form::privacy_admin_only(),
      0,
      0,
      0,
      string::utf8(b""),
      vector::empty<address>(),
      &clock,
      ctx,
    );
    clock::destroy_for_testing(clock);
    transfer::public_transfer(cap, ADMIN);
  };

  ts::next_tx(&mut scenario, ADMIN);
  let cap = ts::take_from_sender<FormOwnerCap>(&scenario);
  let form_obj = ts::take_shared<Form>(&scenario);

  // Build a Seal id: 32 bytes form id + 1 tier byte.
  let mut id = sui::object::id_to_bytes(&form::id(&form_obj));
  vector::push_back(&mut id, form::privacy_admin_only());

  form::seal_approve_admin_only(id, &form_obj, &cap);

  ts::return_shared(form_obj);
  ts::return_to_sender(&scenario, cap);
  ts::end(scenario);
}

#[test, expected_failure(abort_code = 5, location = echo::form)]
fun seal_approve_time_locked_aborts_before_unlock() {
  let mut scenario = ts::begin(ADMIN);
  let ctx = ts::ctx(&mut scenario);
  let clock = clock::create_for_testing(ctx);
  let cap = form::create_form(
    string::utf8(b"s"),
    string::utf8(b"m"),
    form::privacy_time_locked(),
    0,
    0,
    99999999999, // far in the future
    string::utf8(b""),
    vector::empty<address>(),
    &clock,
    ctx,
  );
  transfer::public_transfer(cap, ADMIN);

  ts::next_tx(&mut scenario, ADMIN);
  let form_obj = ts::take_shared<Form>(&scenario);

  let mut id = sui::object::id_to_bytes(&form::id(&form_obj));
  vector::push_back(&mut id, form::privacy_time_locked());

  // Clock is at 0; unlock is 99999999999 → must abort with ENotYetUnlocked (5).
  form::seal_approve_time_locked(id, &form_obj, &clock);

  clock::destroy_for_testing(clock);
  ts::return_shared(form_obj);
  ts::end(scenario);
}

#[test, expected_failure(abort_code = 4, location = echo::form)]
fun seal_approve_admin_only_aborts_on_wrong_id() {
  let mut scenario = ts::begin(ADMIN);
  {
    let ctx = ts::ctx(&mut scenario);
    let clock = clock::create_for_testing(ctx);
    let cap = form::create_form(
      string::utf8(b"s"),
      string::utf8(b"m"),
      form::privacy_admin_only(),
      0,
      0,
      0,
      string::utf8(b""),
      vector::empty<address>(),
      &clock,
      ctx,
    );
    clock::destroy_for_testing(clock);
    transfer::public_transfer(cap, ADMIN);
  };

  ts::next_tx(&mut scenario, ADMIN);
  let cap = ts::take_from_sender<FormOwnerCap>(&scenario);
  let form_obj = ts::take_shared<Form>(&scenario);

  // 33 bytes of zeros → id prefix won't match form.id → ESealIdMismatch (4).
  let mut id: vector<u8> = vector[];
  let mut i: u64 = 0;
  while (i < 33) {
    vector::push_back(&mut id, 0);
    i = i + 1;
  };
  form::seal_approve_admin_only(id, &form_obj, &cap);

  ts::return_shared(form_obj);
  ts::return_to_sender(&scenario, cap);
  ts::end(scenario);
}

// ---- Multi-admin (OR-of-N) tests ----------------------------------------

const ADMIN_B: address = @0xA2;
const ADMIN_C: address = @0xA3;

#[test]
fun create_form_with_extra_admins_mints_caps_to_each() {
  let mut scenario = ts::begin(ADMIN);
  {
    let ctx = ts::ctx(&mut scenario);
    let clock = clock::create_for_testing(ctx);
    let cap = form::create_form(
      string::utf8(b"s"),
      string::utf8(b"m"),
      form::privacy_threshold(),
      1,
      1,
      0,
      string::utf8(b""),
      vector[ADMIN_B, ADMIN_C],
      &clock,
      ctx,
    );
    clock::destroy_for_testing(clock);
    transfer::public_transfer(cap, ADMIN);
  };

  // Original sender holds a cap.
  ts::next_tx(&mut scenario, ADMIN);
  let cap_a = ts::take_from_sender<FormOwnerCap>(&scenario);
  ts::return_to_sender(&scenario, cap_a);

  // ADMIN_B holds a cap.
  ts::next_tx(&mut scenario, ADMIN_B);
  let cap_b = ts::take_from_sender<FormOwnerCap>(&scenario);
  ts::return_to_sender(&scenario, cap_b);

  // ADMIN_C holds a cap.
  ts::next_tx(&mut scenario, ADMIN_C);
  let cap_c = ts::take_from_sender<FormOwnerCap>(&scenario);
  ts::return_to_sender(&scenario, cap_c);

  ts::end(scenario);
}

#[test]
fun any_extra_admin_can_seal_approve() {
  let mut scenario = ts::begin(ADMIN);
  {
    let ctx = ts::ctx(&mut scenario);
    let clock = clock::create_for_testing(ctx);
    let cap = form::create_form(
      string::utf8(b"s"),
      string::utf8(b"m"),
      form::privacy_admin_only(),
      0,
      0,
      0,
      string::utf8(b""),
      vector[ADMIN_B],
      &clock,
      ctx,
    );
    clock::destroy_for_testing(clock);
    transfer::public_transfer(cap, ADMIN);
  };

  // ADMIN_B (the extra admin) should be able to call seal_approve_admin_only
  // with their own cap — proving the OR-of-N semantics work.
  ts::next_tx(&mut scenario, ADMIN_B);
  let cap_b = ts::take_from_sender<FormOwnerCap>(&scenario);
  let form_obj = ts::take_shared<Form>(&scenario);

  let mut id = sui::object::id_to_bytes(&form::id(&form_obj));
  vector::push_back(&mut id, form::privacy_admin_only());

  form::seal_approve_admin_only(id, &form_obj, &cap_b);

  ts::return_shared(form_obj);
  ts::return_to_sender(&scenario, cap_b);
  ts::end(scenario);
}

// ---- Nullifier uniqueness tests -----------------------------------------

#[test]
fun anonymous_distinct_commitments_both_succeed() {
  let mut scenario = ts::begin(ADMIN);
  new_public_form_in_scenario(&mut scenario);

  ts::next_tx(&mut scenario, USER);
  let mut form_obj = ts::take_shared<Form>(&scenario);
  let ctx = ts::ctx(&mut scenario);
  let clock = clock::create_for_testing(ctx);
  let _s1 = submission::submit_anonymous(
    &mut form_obj,
    string::utf8(b"p1"),
    vector[1, 2, 3, 4],
    &clock,
    ctx,
  );
  let _s2 = submission::submit_anonymous(
    &mut form_obj,
    string::utf8(b"p2"),
    vector[5, 6, 7, 8],
    &clock,
    ctx,
  );
  clock::destroy_for_testing(clock);
  assert!(form::submission_count(&form_obj) == 2, 0);
  assert!(form::commitment_used(&form_obj, vector[1, 2, 3, 4]), 0);
  assert!(form::commitment_used(&form_obj, vector[5, 6, 7, 8]), 0);
  assert!(!form::commitment_used(&form_obj, vector[9, 9]), 0);
  ts::return_shared(form_obj);
  ts::end(scenario);
}

#[test, expected_failure(abort_code = 7, location = echo::form)]
fun anonymous_double_submit_with_same_commitment_aborts() {
  let mut scenario = ts::begin(ADMIN);
  new_public_form_in_scenario(&mut scenario);

  ts::next_tx(&mut scenario, USER);
  let mut form_obj = ts::take_shared<Form>(&scenario);
  let ctx = ts::ctx(&mut scenario);
  let clock = clock::create_for_testing(ctx);
  let _s1 = submission::submit_anonymous(
    &mut form_obj,
    string::utf8(b"p1"),
    vector[1, 2, 3, 4],
    &clock,
    ctx,
  );
  // Second submit with same commitment — must abort with ECommitmentAlreadyUsed (7).
  let _s2 = submission::submit_anonymous(
    &mut form_obj,
    string::utf8(b"p2"),
    vector[1, 2, 3, 4],
    &clock,
    ctx,
  );
  clock::destroy_for_testing(clock);
  ts::return_shared(form_obj);
  ts::end(scenario);
}

#[test, expected_failure(abort_code = 3, location = echo::form)]
fun threshold_invalid_aborts() {
  let mut scenario = ts::begin(ADMIN);
  let ctx = ts::ctx(&mut scenario);
  let clock = clock::create_for_testing(ctx);
  let cap = form::create_form(
    string::utf8(b"s"),
    string::utf8(b"m"),
    form::privacy_threshold(),
    4,
    2,
    0,
    string::utf8(b""),
    vector::empty<address>(),
    &clock,
    ctx,
  );
  clock::destroy_for_testing(clock);
  transfer::public_transfer(cap, ADMIN);
  ts::end(scenario);
}

// ---- Real m-of-n threshold via ApprovalWitness ---------------------------

/// Create a Threshold-tier form with k required and 3 admins (sender + B + C).
fun new_threshold_form(scenario: &mut ts::Scenario, required_k: u8) {
  let ctx = ts::ctx(scenario);
  let clock = clock::create_for_testing(ctx);
  let cap = form::create_form(
    string::utf8(b"s"),
    string::utf8(b"m"),
    form::privacy_threshold(),
    required_k,
    3,
    0,
    string::utf8(b""),
    vector[ADMIN_B, ADMIN_C],
    &clock,
    ctx,
  );
  clock::destroy_for_testing(clock);
  transfer::public_transfer(cap, ADMIN);
}

/// Build the Seal identity for a Threshold form: 32-byte form id + tier byte.
fun threshold_identity(form_obj: &form::Form): vector<u8> {
  let mut id = sui::object::id_to_bytes(&form::id(form_obj));
  vector::push_back(&mut id, form::privacy_threshold());
  id
}

#[test]
fun post_approval_mints_witness_with_signer() {
  let mut scenario = ts::begin(ADMIN);
  new_threshold_form(&mut scenario, 2);

  ts::next_tx(&mut scenario, ADMIN_B);
  let cap_b = ts::take_from_sender<FormOwnerCap>(&scenario);
  let form_obj = ts::take_shared<form::Form>(&scenario);
  let id = threshold_identity(&form_obj);
  let ctx = ts::ctx(&mut scenario);
  let clock = clock::create_for_testing(ctx);
  form::post_approval(&cap_b, &form_obj, id, &clock, ctx);
  clock::destroy_for_testing(clock);
  ts::return_to_sender(&scenario, cap_b);
  ts::return_shared(form_obj);

  ts::next_tx(&mut scenario, ADMIN);
  let w = ts::take_shared<ApprovalWitness>(&scenario);
  assert!(form::witness_signer(&w) == ADMIN_B, 0);
  ts::return_shared(w);
  ts::end(scenario);
}

#[test]
fun seal_approve_m_of_n_passes_with_k_unique_witnesses() {
  let mut scenario = ts::begin(ADMIN);
  new_threshold_form(&mut scenario, 2);

  // Sender admin posts witness 1.
  ts::next_tx(&mut scenario, ADMIN);
  let cap_a = ts::take_from_sender<FormOwnerCap>(&scenario);
  let form_obj = ts::take_shared<form::Form>(&scenario);
  let id = threshold_identity(&form_obj);
  {
    let ctx = ts::ctx(&mut scenario);
    let clock = clock::create_for_testing(ctx);
    form::post_approval(&cap_a, &form_obj, id, &clock, ctx);
    clock::destroy_for_testing(clock);
  };
  ts::return_to_sender(&scenario, cap_a);
  ts::return_shared(form_obj);

  // ADMIN_B posts witness 2.
  ts::next_tx(&mut scenario, ADMIN_B);
  let cap_b = ts::take_from_sender<FormOwnerCap>(&scenario);
  let form_obj = ts::take_shared<form::Form>(&scenario);
  let id = threshold_identity(&form_obj);
  {
    let ctx = ts::ctx(&mut scenario);
    let clock = clock::create_for_testing(ctx);
    form::post_approval(&cap_b, &form_obj, id, &clock, ctx);
    clock::destroy_for_testing(clock);
  };
  ts::return_to_sender(&scenario, cap_b);
  ts::return_shared(form_obj);

  // Anyone collects both witnesses + calls seal_approve_threshold_m_of_n.
  ts::next_tx(&mut scenario, USER);
  let w1 = ts::take_shared<ApprovalWitness>(&scenario);
  let w2 = ts::take_shared<ApprovalWitness>(&scenario);
  let form_obj = ts::take_shared<form::Form>(&scenario);
  let id = threshold_identity(&form_obj);
  let mut approvals = vector::empty<ApprovalWitness>();
  vector::push_back(&mut approvals, w1);
  vector::push_back(&mut approvals, w2);
  form::seal_approve_threshold_m_of_n(id, &form_obj, approvals);
  ts::return_shared(form_obj);
  ts::end(scenario);
}

#[test, expected_failure(abort_code = 8, location = echo::form)]
fun seal_approve_m_of_n_aborts_when_below_threshold() {
  let mut scenario = ts::begin(ADMIN);
  new_threshold_form(&mut scenario, 2);

  // Only one admin posts a witness — below the k=2 threshold.
  ts::next_tx(&mut scenario, ADMIN);
  let cap_a = ts::take_from_sender<FormOwnerCap>(&scenario);
  let form_obj = ts::take_shared<form::Form>(&scenario);
  let id = threshold_identity(&form_obj);
  {
    let ctx = ts::ctx(&mut scenario);
    let clock = clock::create_for_testing(ctx);
    form::post_approval(&cap_a, &form_obj, id, &clock, ctx);
    clock::destroy_for_testing(clock);
  };
  ts::return_to_sender(&scenario, cap_a);
  ts::return_shared(form_obj);

  ts::next_tx(&mut scenario, USER);
  let w1 = ts::take_shared<ApprovalWitness>(&scenario);
  let form_obj = ts::take_shared<form::Form>(&scenario);
  let id = threshold_identity(&form_obj);
  let mut approvals = vector::empty<ApprovalWitness>();
  vector::push_back(&mut approvals, w1);
  // Aborts with EInsufficientApprovals (8) — only 1 witness, need 2.
  form::seal_approve_threshold_m_of_n(id, &form_obj, approvals);
  ts::return_shared(form_obj);
  ts::end(scenario);
}

#[test, expected_failure(abort_code = 11, location = echo::form)]
fun seal_approve_m_of_n_aborts_on_duplicate_signer() {
  let mut scenario = ts::begin(ADMIN);
  new_threshold_form(&mut scenario, 2);

  // Same admin posts two witnesses for the same identity.
  ts::next_tx(&mut scenario, ADMIN);
  let cap_a = ts::take_from_sender<FormOwnerCap>(&scenario);
  let form_obj = ts::take_shared<form::Form>(&scenario);
  let id = threshold_identity(&form_obj);
  {
    let ctx = ts::ctx(&mut scenario);
    let clock = clock::create_for_testing(ctx);
    form::post_approval(&cap_a, &form_obj, id, &clock, ctx);
    clock::destroy_for_testing(clock);
  };
  ts::return_shared(form_obj);

  ts::next_tx(&mut scenario, ADMIN);
  let form_obj = ts::take_shared<form::Form>(&scenario);
  let id = threshold_identity(&form_obj);
  {
    let ctx = ts::ctx(&mut scenario);
    let clock = clock::create_for_testing(ctx);
    form::post_approval(&cap_a, &form_obj, id, &clock, ctx);
    clock::destroy_for_testing(clock);
  };
  ts::return_to_sender(&scenario, cap_a);
  ts::return_shared(form_obj);

  ts::next_tx(&mut scenario, USER);
  let w1 = ts::take_shared<ApprovalWitness>(&scenario);
  let w2 = ts::take_shared<ApprovalWitness>(&scenario);
  let form_obj = ts::take_shared<form::Form>(&scenario);
  let id = threshold_identity(&form_obj);
  let mut approvals = vector::empty<ApprovalWitness>();
  vector::push_back(&mut approvals, w1);
  vector::push_back(&mut approvals, w2);
  // Aborts with EDuplicateSigner (11) — both witnesses signed by ADMIN.
  form::seal_approve_threshold_m_of_n(id, &form_obj, approvals);
  ts::return_shared(form_obj);
  ts::end(scenario);
}

// Note: a "post_approval with mismatched cap" test would mostly duplicate
// the existing seal_approve_admin_only_aborts_on_wrong_id pattern, since
// post_approval shares the same EWrongOwnerCap branch. Skipped here to
// keep the test surface tight.
