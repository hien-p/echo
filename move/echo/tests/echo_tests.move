#[test_only]
module echo::echo_tests;

use echo::{form::{Self, Form, FormOwnerCap}, submission::{Self, SubmissionRef}};
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
    &clock,
    ctx,
  );
  clock::destroy_for_testing(clock);
  transfer::public_transfer(cap, ADMIN);
  ts::end(scenario);
}
