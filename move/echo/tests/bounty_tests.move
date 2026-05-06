#[test_only]
module echo::bounty_tests;

use echo::{bounty::{Self, BountyPool}, form::{Self, FormOwnerCap}};
use std::string;
use sui::{clock, coin, sui::SUI, test_scenario as ts};

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
    &clock,
    ctx,
  );
  clock::destroy_for_testing(clock);
  transfer::public_transfer(cap, ADMIN);
}

#[test]
fun create_payout_close_flow() {
  let mut scenario = ts::begin(ADMIN);
  create_form_for_admin(&mut scenario);

  ts::next_tx(&mut scenario, ADMIN);
  let cap = ts::take_from_sender<FormOwnerCap>(&scenario);
  let initial = coin::mint_for_testing<SUI>(1000, ts::ctx(&mut scenario));
  bounty::create_bounty(
    &cap,
    initial,
    bounty::mode_admin_select(),
    ts::ctx(&mut scenario),
  );
  ts::return_to_sender(&scenario, cap);

  ts::next_tx(&mut scenario, ADMIN);
  let cap = ts::take_from_sender<FormOwnerCap>(&scenario);
  let mut pool = ts::take_shared<BountyPool>(&scenario);
  assert!(bounty::pool_balance(&pool) == 1000, 0);
  bounty::payout_to(&cap, &mut pool, USER, 200, ts::ctx(&mut scenario));
  assert!(bounty::pool_balance(&pool) == 800, 0);
  ts::return_shared(pool);
  ts::return_to_sender(&scenario, cap);

  ts::next_tx(&mut scenario, ADMIN);
  let cap = ts::take_from_sender<FormOwnerCap>(&scenario);
  let pool = ts::take_shared<BountyPool>(&scenario);
  let refund = bounty::close_bounty(&cap, pool, ts::ctx(&mut scenario));
  assert!(coin::value(&refund) == 800, 0);
  transfer::public_transfer(refund, ADMIN);
  ts::return_to_sender(&scenario, cap);

  ts::end(scenario);
}

#[test]
fun add_funds_increases_balance() {
  let mut scenario = ts::begin(ADMIN);
  create_form_for_admin(&mut scenario);

  ts::next_tx(&mut scenario, ADMIN);
  let cap = ts::take_from_sender<FormOwnerCap>(&scenario);
  let initial = coin::mint_for_testing<SUI>(500, ts::ctx(&mut scenario));
  bounty::create_bounty(
    &cap,
    initial,
    bounty::mode_admin_select(),
    ts::ctx(&mut scenario),
  );
  ts::return_to_sender(&scenario, cap);

  ts::next_tx(&mut scenario, USER);
  let mut pool = ts::take_shared<BountyPool>(&scenario);
  let top_up = coin::mint_for_testing<SUI>(250, ts::ctx(&mut scenario));
  bounty::add_funds(&mut pool, top_up);
  assert!(bounty::pool_balance(&pool) == 750, 0);
  ts::return_shared(pool);

  ts::end(scenario);
}

#[test, expected_failure(abort_code = 201, location = echo::bounty)]
fun overdraft_payout_aborts() {
  let mut scenario = ts::begin(ADMIN);
  create_form_for_admin(&mut scenario);

  ts::next_tx(&mut scenario, ADMIN);
  let cap = ts::take_from_sender<FormOwnerCap>(&scenario);
  let initial = coin::mint_for_testing<SUI>(100, ts::ctx(&mut scenario));
  bounty::create_bounty(
    &cap,
    initial,
    bounty::mode_admin_select(),
    ts::ctx(&mut scenario),
  );
  ts::return_to_sender(&scenario, cap);

  ts::next_tx(&mut scenario, ADMIN);
  let cap = ts::take_from_sender<FormOwnerCap>(&scenario);
  let mut pool = ts::take_shared<BountyPool>(&scenario);
  bounty::payout_to(&cap, &mut pool, USER, 999, ts::ctx(&mut scenario));
  ts::return_shared(pool);
  ts::return_to_sender(&scenario, cap);

  ts::end(scenario);
}
