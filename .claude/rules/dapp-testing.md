---
paths:
  - "dapp/test/**/*.ts"
---

# Dapp Testing Rules

- Use Vitest for all tests (`import { describe, it, expect } from "vitest"`).
- Use `describe.sequential` when tests depend on execution order or share mutable imported state.
- Import Next.js route handlers dynamically in `beforeAll`, not at the top level — this avoids env loading issues.
- Env vars load automatically via `dotenv/config` in `dapp/vitest.config.mts`.
- Test API routes by importing the handler and calling it as a function with a `new Request()`. Do not hit `localhost` or require a running dev server.
- When testing async API routes, verify success, validation/error, and unauthorized/forbidden paths when auth or input checks exist.
- If a route parallelizes work or defers side effects with `after()`, assert the main response contract and mock the side-effect module separately instead of relying on timing.
- Follow the pattern in `dapp/test/health.test.ts`.
- After changes, run `cd dapp && pnpm test`.
