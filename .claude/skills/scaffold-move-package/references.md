# Scaffold References

Use these references before drafting a new Move package.

## Local Repo References

- `examples/counter-backend-e2e-test/move/counter/`
  - Minimal package layout, `Move.toml`, shared-object structure, and test-file placement.
  - The local test file is only a stub, so treat it as layout guidance rather than a finished testing example.
- `examples/coin/move/`
  - Best local reference for OTW coins, treasury-cap flows, and `sui::test_scenario` usage.

## Pattern Map

| User wants                                           | Start from                                                                                                                                                       | Notes                                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Counter, registry, marketplace, voting, shared state | `examples/counter-backend-e2e-test/move/counter/`                                                                                                                | Good for shared-object layout and module label syntax.                    |
| Fungible token, coin, currency                       | `examples/coin/move/`                                                                                                                                            | Best local example for OTW and test structure.                            |
| NFT, collectible, certificate, ticket                | [Move Book: Events](https://move-book.com/programmability/events.html) and [Sui Move best practices](https://docs.sui.io/guides/developer/move-best-practices)   | Model owned objects explicitly and emit events for key lifecycle actions. |
| Admin-gated actions                                  | [Move Book: Capability pattern](https://move-book.com/programmability/capability.html)                                                                           | Prefer capability objects over sender-address checks.                     |
| Display metadata / publisher authority               | [Move Book: Publisher](https://move-book.com/programmability/publisher.html) and [Move Book: Object Display](https://move-book.com/programmability/display.html) | Use when wallet or explorer rendering matters.                            |
| Dynamic storage / attachments                        | [Move Book: Dynamic fields](https://move-book.com/programmability/dynamic-fields.html)                                                                           | Use for scalable keyed data attached to objects.                          |

## Additional References

- [The Move Book](https://move-book.com)
- [Sui Move best practices](https://docs.sui.io/guides/developer/move-best-practices)
- [Sui Move conventions](https://docs.sui.io/concepts/sui-move-concepts/conventions)
- [sui-framework tests](https://github.com/MystenLabs/sui/tree/main/crates/sui-framework/packages/sui-framework/tests)
