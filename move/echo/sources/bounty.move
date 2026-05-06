/// Echo — Bounty module.
///
/// Wraps a `Balance<SUI>` keyed to a form. Form owner stakes funds at create
/// time; anyone can top up; only the `FormOwnerCap` holder can pay out or
/// close. Distribution mode is recorded for off-chain selection logic
/// (admin-select / top-K / quadratic) — payout itself is single-recipient
/// so the frontend can apply any policy by composing `payout_to` calls.
module echo::bounty;

use echo::form::{Self, FormOwnerCap};
use sui::{balance::{Self, Balance}, coin::{Self, Coin}, event, sui::SUI};

const EWrongFormCap: u64 = 200;
const EInsufficientPool: u64 = 201;

const MODE_ADMIN_SELECT: u8 = 0;
const MODE_TOP_K: u8 = 1;
const MODE_QUADRATIC: u8 = 2;

public struct BountyPool has key {
  id: UID,
  form_id: ID,
  mode: u8,
  funds: Balance<SUI>,
}

public struct BountyCreated has copy, drop {
  pool_id: ID,
  form_id: ID,
  mode: u8,
  initial_amount: u64,
}

public struct BountyTopUp has copy, drop {
  pool_id: ID,
  amount: u64,
}

public struct BountyPayout has copy, drop {
  pool_id: ID,
  recipient: address,
  amount: u64,
}

public struct BountyClosed has copy, drop {
  pool_id: ID,
  refunded: u64,
}

public fun create_bounty(
  cap: &FormOwnerCap,
  initial: Coin<SUI>,
  mode: u8,
  ctx: &mut TxContext,
) {
  let amount = coin::value(&initial);
  let pool = BountyPool {
    id: object::new(ctx),
    form_id: form::cap_form_id(cap),
    mode,
    funds: coin::into_balance(initial),
  };
  event::emit(BountyCreated {
    pool_id: object::id(&pool),
    form_id: pool.form_id,
    mode,
    initial_amount: amount,
  });
  transfer::share_object(pool);
}

public fun add_funds(pool: &mut BountyPool, top_up: Coin<SUI>) {
  let amount = coin::value(&top_up);
  balance::join(&mut pool.funds, coin::into_balance(top_up));
  event::emit(BountyTopUp {
    pool_id: object::id(pool),
    amount,
  });
}

public fun payout_to(
  cap: &FormOwnerCap,
  pool: &mut BountyPool,
  recipient: address,
  amount: u64,
  ctx: &mut TxContext,
) {
  assert!(form::cap_form_id(cap) == pool.form_id, EWrongFormCap);
  assert!(balance::value(&pool.funds) >= amount, EInsufficientPool);
  let payout = balance::split(&mut pool.funds, amount);
  event::emit(BountyPayout {
    pool_id: object::id(pool),
    recipient,
    amount,
  });
  transfer::public_transfer(coin::from_balance(payout, ctx), recipient);
}

public fun close_bounty(
  cap: &FormOwnerCap,
  pool: BountyPool,
  ctx: &mut TxContext,
): Coin<SUI> {
  assert!(form::cap_form_id(cap) == pool.form_id, EWrongFormCap);
  let BountyPool { id, form_id: _, mode: _, funds } = pool;
  let refund_amount = balance::value(&funds);
  let pool_id_inner = object::uid_to_inner(&id);
  let refund = coin::from_balance(funds, ctx);
  event::emit(BountyClosed {
    pool_id: pool_id_inner,
    refunded: refund_amount,
  });
  object::delete(id);
  refund
}

public fun pool_balance(pool: &BountyPool): u64 { balance::value(&pool.funds) }

public fun pool_form_id(pool: &BountyPool): ID { pool.form_id }

public fun pool_mode(pool: &BountyPool): u8 { pool.mode }

public fun mode_admin_select(): u8 { MODE_ADMIN_SELECT }

public fun mode_top_k(): u8 { MODE_TOP_K }

public fun mode_quadratic(): u8 { MODE_QUADRATIC }
