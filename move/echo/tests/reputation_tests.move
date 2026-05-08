#[test_only]
module echo::reputation_tests;

use echo::{
  form::{Self, FormOwnerCap},
  reputation::{Self, Reputation, CreditTicket}
};
use std::string;
use sui::{clock, test_scenario as ts};

const ADMIN: address = @0xA1;
const USER: address = @0xB2;

fun create_form_for_admin(scenario: &mut ts::Scenario) {
  let ctx = ts::ctx(scenario);
  let clock = clock::create_for_testing(ctx);
  let cap = form::create_form(
    string::utf8(b"s"),
    string::utf8(b"m"),
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
fun mint_issue_claim_full_flow() {
  let mut scenario = ts::begin(ADMIN);
  create_form_for_admin(&mut scenario);

  ts::next_tx(&mut scenario, USER);
  reputation::mint(ts::ctx(&mut scenario));

  ts::next_tx(&mut scenario, ADMIN);
  let cap = ts::take_from_sender<FormOwnerCap>(&scenario);
  reputation::issue_credit(&cap, USER, 10, ts::ctx(&mut scenario));
  ts::return_to_sender(&scenario, cap);

  ts::next_tx(&mut scenario, USER);
  let ticket = ts::take_from_sender<CreditTicket>(&scenario);
  let mut rep = ts::take_from_sender<Reputation>(&scenario);
  reputation::claim_credit(ticket, &mut rep);
  assert!(reputation::score(&rep) == 10, 0);
  assert!(reputation::submission_count(&rep) == 1, 0);
  ts::return_to_sender(&scenario, rep);

  ts::end(scenario);
}

#[test]
fun multiple_credits_accumulate() {
  let mut scenario = ts::begin(ADMIN);
  create_form_for_admin(&mut scenario);

  ts::next_tx(&mut scenario, USER);
  reputation::mint(ts::ctx(&mut scenario));

  ts::next_tx(&mut scenario, ADMIN);
  let cap = ts::take_from_sender<FormOwnerCap>(&scenario);
  reputation::issue_credit(&cap, USER, 5, ts::ctx(&mut scenario));
  reputation::issue_credit(&cap, USER, 7, ts::ctx(&mut scenario));
  ts::return_to_sender(&scenario, cap);

  // Claim both tickets in one tx.
  ts::next_tx(&mut scenario, USER);
  let t1 = ts::take_from_sender<CreditTicket>(&scenario);
  let t2 = ts::take_from_sender<CreditTicket>(&scenario);
  let mut rep = ts::take_from_sender<Reputation>(&scenario);
  reputation::claim_credit(t1, &mut rep);
  reputation::claim_credit(t2, &mut rep);
  assert!(reputation::score(&rep) == 12, 0);
  assert!(reputation::submission_count(&rep) == 2, 0);
  ts::return_to_sender(&scenario, rep);

  ts::end(scenario);
}
