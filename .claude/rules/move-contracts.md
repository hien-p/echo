---
paths:
  - "move/**/*.move"
  - "move/**/Move.toml"
---

# Move Contract Rules

- Place all Move packages under `move/<package-name>/` with sources in `move/<package-name>/sources/`.
- Set `edition = "2024"` in every `Move.toml`.
- Format Move files with `pnpm format`; `.move` files are handled by `@mysten/prettier-plugin-move`.
- Verify compilation with `sui move build --path move/<package-name>`.
- Do not modify contracts in `examples/`; those are read-only reference implementations.
- Use the publish scripts in `publish/` for real deploys instead of publishing manually in production workflows.

## Tests

- Place test files in `move/<package-name>/tests/<package-name>_tests.move`.
- Mark test modules with `#[test_only]`.
- Import the source module with `use <package-name>::<module>;`.
- Mark test functions with `#[test]`.
- For expected failures, use `#[test, expected_failure(abort_code = ...)]`.
- Use `sui::test_scenario` for testing shared objects and `sui::test_utils::destroy` for cleanup.
- Run tests with `sui move test --path move/<package-name>`.
- Do not rely on `examples/` for layout or Move patterns: teams often remove that folder after bootstrapping from the template. Prefer packages under `move/`, [The Move Book](https://move-book.com), [Sui Move best practices](https://docs.sui.io/guides/developer/move-best-practices), and [Sui Move conventions](https://docs.sui.io/concepts/sui-move-concepts/conventions).
- For framework-level test patterns (shared objects, coin/OTW, bag, table, dynamic_field, event), see [sui-framework tests](https://github.com/MystenLabs/sui/tree/main/crates/sui-framework/packages/sui-framework/tests).
- When adding a new contract that the frontend will interact with, add the package ID as a `NEXT_PUBLIC_...` env var in `dapp/.env.example` and validate it in `dapp/src/config/clientConfig.ts`.
