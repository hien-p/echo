/// Echo — Reputation module.
///
/// Soulbound respondent reputation built around a ticket-and-claim flow:
///
/// 1. `mint` — anyone calls once to receive a soulbound `Reputation` object
///    (key only, no `store`, so it can never leave the holder).
/// 2. `issue_credit` — gated by `FormOwnerCap`; mints a `CreditTicket`
///    addressed to a specific respondent.
/// 3. `claim_credit` — the respondent consumes their ticket, bumping the
///    score on their `Reputation`. Object ownership ensures only the
///    addressed holder can call this.
///
/// The single-Reputation-per-address invariant is not enforced on chain
/// (would require a shared registry + dynamic_field). Frontend should
/// guide users to a single mint.
module echo::reputation;

use echo::form::{Self, FormOwnerCap};
use sui::event;

const EWrongHolder: u64 = 100;

public struct Reputation has key {
  id: UID,
  holder: address,
  score: u64,
  submission_count: u64,
}

public struct CreditTicket has key {
  id: UID,
  form_id: ID,
  recipient: address,
  score_delta: u64,
}

public struct ReputationMinted has copy, drop {
  rep_id: ID,
  holder: address,
}

public struct CreditIssued has copy, drop {
  ticket_id: ID,
  form_id: ID,
  recipient: address,
  score_delta: u64,
}

public struct CreditClaimed has copy, drop {
  rep_id: ID,
  holder: address,
  score_delta: u64,
  new_score: u64,
}

public fun mint(ctx: &mut TxContext) {
  let rep = Reputation {
    id: object::new(ctx),
    holder: ctx.sender(),
    score: 0,
    submission_count: 0,
  };
  event::emit(ReputationMinted {
    rep_id: object::id(&rep),
    holder: rep.holder,
  });
  transfer::transfer(rep, ctx.sender());
}

public fun issue_credit(
  cap: &FormOwnerCap,
  recipient: address,
  score_delta: u64,
  ctx: &mut TxContext,
) {
  let ticket = CreditTicket {
    id: object::new(ctx),
    form_id: form::cap_form_id(cap),
    recipient,
    score_delta,
  };
  event::emit(CreditIssued {
    ticket_id: object::id(&ticket),
    form_id: ticket.form_id,
    recipient,
    score_delta,
  });
  transfer::transfer(ticket, recipient);
}

public fun claim_credit(ticket: CreditTicket, rep: &mut Reputation) {
  let CreditTicket { id, form_id: _, recipient, score_delta } = ticket;
  assert!(rep.holder == recipient, EWrongHolder);
  rep.score = rep.score + score_delta;
  rep.submission_count = rep.submission_count + 1;
  object::delete(id);
  event::emit(CreditClaimed {
    rep_id: object::id(rep),
    holder: rep.holder,
    score_delta,
    new_score: rep.score,
  });
}

public fun holder(r: &Reputation): address { r.holder }

public fun score(r: &Reputation): u64 { r.score }

public fun submission_count(r: &Reputation): u64 { r.submission_count }

public fun ticket_recipient(t: &CreditTicket): address { t.recipient }

public fun ticket_score_delta(t: &CreditTicket): u64 { t.score_delta }

public fun ticket_form_id(t: &CreditTicket): ID { t.form_id }
