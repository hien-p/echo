---
name: add-dapp-page
description: >-
  Scaffold a new page in the `dapp/` Next.js app with a route, feature component,
  optional API route, env wiring, and API-focused Vitest coverage. Use when the
  user asks to add a page, route, or frontend feature in the dapp. Do not use for
  Move contract creation, publishing, CI/CD, or edits under `examples/`.
argument-hint: "<page or feature name>"
---

# Add dApp Page

## Task

Create a new Next.js page in `dapp/` with the smallest set of supporting pieces the feature needs.

## Inputs

- `$ARGUMENTS`: feature or page name (e.g. `"nft-gallery"`, `"token-transfer"`).
- If empty, ask the user what page they want to add before proceeding.

## Preconditions

- Working directory is the monorepo root.
- `pnpm install` has been run.
- If the feature interacts with a Move contract, the package ID or required env keys are known.

## Scope Checklist

Choose only the pieces the feature actually needs:

| Piece                                                              | When needed                                                       |
| ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Page route (`dapp/src/app/<route>/page.tsx`)                       | The feature has its own URL                                       |
| Feature component (`dapp/src/components/general/`)                 | The page contains reusable or stateful UI                         |
| API route (`dapp/src/app/api/<name>/route.ts`)                     | The feature needs server-side logic, secrets, or proxying         |
| Route metadata (`metadata`, `generateMetadata`, file-based assets) | The page is public, shareable, or search-indexed                  |
| New env vars                                                       | The feature needs package IDs, RPC config, or external keys       |
| Test (`dapp/test/<feature>.test.ts`)                               | Required for new API routes; optional for extracted non-DOM logic |

## Steps

### 0. Choose the right rendering boundary

1. Keep `page.tsx` server-side by default. Even client-heavy routes should usually be a server page that renders a child client component.
2. Move wallet hooks, browser APIs, and event handlers into `dapp/src/components/general/<FeatureName>.tsx`.
3. Use an API route only for server-only work: secrets, webhooks, proxying, or a public/external JSON API.
4. Keep wallet-signed on-chain transactions in client components using `@mysten/dapp-kit-react`.
5. If only one section is slow, use `Suspense` and an async child server component instead of blocking the entire page.
6. If the page is public or shareable, add route metadata and prefer file-based metadata assets in `dapp/src/app/` when static files are enough.

### 1. Add environment variables (if needed)

1. Add client-visible values to `dapp/.env.example` with the `NEXT_PUBLIC_` prefix.
2. Extend the Zod schema in `dapp/src/config/clientConfig.ts`.
3. Mark optional fields with `.optional()`.

### 2. Create the feature component

1. Create `dapp/src/components/general/<FeatureName>.tsx`.
2. Follow existing patterns (see `dapp/src/components/general/ConnectWalletMenu.tsx`):
   - `"use client"` at top if using hooks or browser APIs.
   - Named export (not default).
   - Use `@mysten/dapp-kit-react` hooks only when needed (for example `useCurrentAccount`, `useCurrentClient`, `useDAppKit`).
   - Use `Transaction` from `@mysten/sui/transactions` for `moveCall`s.
3. Use `cn()` from `@/lib/utils` for conditional classes.
4. Add new shadcn/ui primitives via `cd dapp && npx shadcn@latest add <component>`.
5. Use Lucide icons.
6. Derive values during render when possible; do not mirror props or state through `useEffect` just to compute UI values.
7. If a mutation happens because of a click or submit, do it in the event handler instead of setting state and reacting in an effect.
8. When state updates depend on previous state, use functional updates.
9. Prefer the existing TanStack Query layer or `@mysten/dapp-kit-react` hooks over ad hoc `useEffect` plus `fetch` code in client components.
10. Lazy-load heavy browser-only UI with `next/dynamic` if it is not needed on first render.
11. Start from `templates/feature-component.tsx` when it helps.

### 3. Create the page route

1. Create `dapp/src/app/<route>/page.tsx`.
2. Default export (Next.js convention for pages).
3. Keep the route file server-side by default. Only add `"use client"` to `page.tsx` if the route file itself truly needs hooks or browser APIs.
4. For mostly interactive pages with little server data, start from `templates/page-client-only.tsx` and keep the interactivity in the child feature component.
5. If the page also renders server-fetched data, use `templates/page-with-suspense.tsx`.
6. If the page is public or shareable, add `metadata` or `generateMetadata` in the server file. In Next.js 16, type `params` and `searchParams` as promises and `await` them.
7. If the same loader powers both the page and `generateMetadata`, use `cache()` for non-fetch loaders to avoid duplicate work.
8. Add navigation in `dapp/src/components/general/Header.tsx` only if the page should be discoverable.

### 4. Create the API route (if needed)

1. Create `dapp/src/app/api/<name>/route.ts`.
2. Export named handlers (`GET`, `POST`), not default.
3. Add `export const dynamic = "force-dynamic"` for non-cacheable endpoints.
4. Read server env from `process.env` or a server-only schema. Never import `dapp/src/config/clientConfig.ts`.
5. Parallelize independent async operations — start promises early, `await` late. Use `Promise.all()` for independent calls.
6. If a branch returns early, defer expensive awaits until after that check.
7. Use `after()` from `next/server` for non-critical side effects so the main response stays fast.
8. Hoist static I/O to module scope instead of re-reading templates or assets on every request.
9. In App Router, keep route handlers in their own segment — `route.ts` cannot live beside `page.tsx`.
10. Follow `dapp/src/app/api/health/route.ts`.

### 5. Add tests when they fit the current setup

1. Every new API route needs a Vitest file in `dapp/test/`.
2. Use `templates/vitest-test.ts` and `dapp/test/health.test.ts` as the pattern.
3. Import route handlers dynamically in `beforeAll()`.
4. Assert status codes and response bodies.
5. Cover success and error paths. Add unauthorized or forbidden tests when the route does auth.
6. If the route uses parallel work or deferred side effects, assert the response contract and mock side-effect modules separately instead of depending on timing.
7. Do not invent DOM-heavy component tests unless you also update the test setup on purpose.

### 6. Verify

Run from the monorepo root:

1. `pnpm format` — fix formatting.
2. `cd dapp && pnpm lint` — no ESLint errors.
3. `cd dapp && pnpm test` — all relevant tests pass.
4. `cd dapp && pnpm build` — build succeeds (catches missing env vars).

## Constraints

- Do not modify files in `examples/`.
- Do not use default exports for components — only pages use default exports.
- Do not install shadcn primitives manually — use `cd dapp && npx shadcn@latest add <component>`.
- Do not hardcode network values or package IDs — read from config or env vars.
- Keep pages server-first. Move client logic into feature components whenever possible.
- Keep components focused. Extract sub-components if a file grows past ~200 lines.
- Prefer regular `ref` props over `forwardRef` wrappers unless an external library type requires `forwardRef`.
- Prefer `use()` for new internal context reads when it improves control flow.
- No inline component definitions inside other components.
- Minimize data passed across RSC boundaries — pick only needed fields.
- Keep metadata in server files, not client components.

## Verification

- [ ] `pnpm format:check` exits 0.
- [ ] `cd dapp && pnpm lint` exits 0.
- [ ] `cd dapp && pnpm test` exits 0.
- [ ] `cd dapp && pnpm build` exits 0.
- [ ] New env vars are documented in `dapp/.env.example` and validated in `dapp/src/config/clientConfig.ts`.

## Failure handling

- **Zod parse error on build:** A required env var is missing. Add it to local env files and `dapp/.env.example`.
- **API route test fails on import:** Switch to dynamic import inside `beforeAll()` and confirm env values load through `dotenv/config`.
- **ESLint errors after shadcn add:** Re-run `cd dapp && npx shadcn@latest add <component>` — running it from the wrong directory misses `components.json`.
- **Build fails at the server/client boundary:** Check `"use client"` placement and whether a client file imports server-only code.
- **Metadata fails in a client page:** Split the route into a server `page.tsx` that exports metadata and renders a child client component.
- **Next.js 16 params/searchParams typing error:** Type them as promises and `await` them in the route or metadata function.
- **Hydration mismatch:** Check for browser-only APIs, timestamps, random IDs, or URL-reading hooks that need a mounted guard or `Suspense`.
