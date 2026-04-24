/*
/// Module: counter
module counter::counter;
*/

// For Move coding conventions, see
// https://docs.sui.io/concepts/sui-move-concepts/conventions

module counter::counter;

/// Structs
public struct Counter has key {
  id: UID,
  value: u64,
}

/// Init Function
fun init(ctx: &mut TxContext) {
  transfer::share_object(Counter {
    id: object::new(ctx),
    value: 0,
  })
}

/// Public Functions
public fun increment(counter: &mut Counter) {
  counter.value = counter.value + 1;
}
