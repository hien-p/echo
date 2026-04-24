---
name: scaffold-move-package
description: >-
  Create a new Sui Move package under `move/` with package layout, `Move.toml`,
  starter modules, and tests based on the closest repo example or documented
  Sui pattern. Use when the user asks to create a Move contract, module, smart
  contract, or new on-chain package. Do not use for publishing or frontend
  integration.
argument-hint: "<package name>"
---

# Scaffold Move Package

## Task

Create a new Sui Move package under `move/` with the correct directory layout, manifest, source module, and tests.

## Inputs

- `$ARGUMENTS`: package name in snake_case (for example `nft_marketplace` or `token_swap`).
- If empty, ask the user for a package name and what the contract should do before proceeding.

## Preconditions

- Working directory is the `dapp-template` monorepo root.
- Sui CLI is installed (`sui --version`).

## Steps

### 1. Pick the closest reference

1. Read [references.md](references.md).
2. Start from the nearest local example when possible:
   - `examples/counter-backend-e2e-test/move/counter/` for shared-object layout.
   - `examples/coin/move/` for OTW coin structure and tests.
3. For patterns without a local example, use the linked Move Book pages in `references.md`.

### 2. Create directory structure

```
move/<package-name>/
├── Move.toml
├── sources/
│   └── <package-name>.move
└── tests/
    └── <package-name>_tests.move
```

### 3. Write `Move.toml`

Follow the style in `examples/counter-backend-e2e-test/move/counter/Move.toml` or `examples/coin/move/Move.toml`:

```toml
[package]
name = "<package-name>"
edition = "2024"
```

- Keep `edition = "2024"`.
- The `@<package-name>` address is derived from `[package].name`. Do not add `[addresses]` or `[dev-addresses]` blocks — they are obsolete under the new Sui package manager.
- `sui` and `std` are implicit dependencies. Do not declare them in `[dependencies]`; the package manager injects them and will reject explicit entries.
- Add other dependencies only when the package truly needs them and you have verified the correct source and revision. Do not invent git revisions.

### 4. Write the source module(s)

Key rules:

- Use `module <package-name>::<module-name>;` syntax (module label, not block).
- Every struct that is a Sui object must have `id: UID` as the first field and `has key`.
- Add `store` ability only if the object should be publicly transferable by anyone. Omit `store` for soulbound or otherwise non-transferable objects.
- OTW structs must use the module name in UPPERCASE and only have `drop`.
- Prefer capability objects (for example `&AdminCap`) over sender-address checks for access control.
- Emit events with `has copy, drop` abilities when users or indexers need to observe state changes.
- Use `sui::dynamic_field as df;` when data could grow unbounded on an object.
- Adapt the chosen reference to the user's use case; do not copy examples verbatim.

### 5. Write tests

- Place tests in `tests/<package-name>_tests.move`.
- Use the `#[test_only]` module attribute.
- Use `sui::test_scenario` for shared objects, capability flows, and multi-step transactions.
- Use `sui::test_utils::destroy` to clean up test objects that are not transferred.
- Test the happy path and at least one failure case when the contract exposes meaningful failure modes.
- For coin and OTW patterns, mirror the structure in `examples/coin/move/tests/drachma_tests.move`.

### 6. Build and test

```bash
sui move build --path move/$ARGUMENTS
sui move test --path move/$ARGUMENTS
pnpm format
```

## Constraints

- Do not modify contracts in `examples/`; they are read-only reference implementations.
- Do not publish the package; that is the `publish-move-package` workflow.
- Do not create frontend components or env vars; that is the `add-dapp-page` workflow.
- Use `edition = "2024"` in every `Move.toml`.
- Do not declare `[addresses]`, `[dev-addresses]`, or `[dev-dependencies]` blocks; `[package].name` is the sole source of the package's named address.
- Do not declare `sui` or `std` in `[dependencies]` — they are implicitly provided.
- Use snake_case for package and module names.
- For multi-module packages, place each module in a separate file under `sources/`.

## Verification

- [ ] `sui move build --path move/$ARGUMENTS` exits 0.
- [ ] `sui move test --path move/$ARGUMENTS` exits 0.
- [ ] `pnpm format` exits 0.
- [ ] `Move.toml` has `edition = "2024"`, no `[addresses]` block, and `[package].name` matches the identifier used in `module <name>::...;` declarations.
- [ ] Source files use module label syntax, not block syntax.
- [ ] OTW struct names (if used) match their module names in UPPERCASE.

## Failure handling

- **"unresolved dependency":** Re-check the dependency source against the example package or official docs; do not guess revisions.
- **"The `sui` dependency is implicitly provided and should not be defined in your manifest":** Remove the explicit `sui` (or `std`) entry from `[dependencies]`. These framework packages are injected automatically.
- **Stale framework commit in `Move.lock`:** If a cached commit has been removed from `MystenLabs/sui`, delete the local `Move.lock` and re-run `sui move build` to regenerate against a fresh implicit dependency.
- **"duplicate module":** Two `.move` files define the same module. Ensure each file has a unique `module package::name;` declaration.
- **Sui CLI not found:** Install via `https://docs.sui.io/guides/developer/getting-started/sui-install`.

## References

- See [references.md](references.md) for the local example map and external links.
