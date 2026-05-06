# CLAUDE.md — Echo

Sui dApp monorepo (pnpm workspaces) with a Next.js frontend, Move contract publishing tools, and integration tests using TestContainers. Bootstrapped from `harrymove-ctrl/sui-dapp-template-main`; conventions below adopt the static-site `/logs` + commit-attribution rules from `hien-p/claude-cloudflare-template`.

## Commit conventions — NEVER attribute commits to Claude

Do not include in commit messages, PR titles/descriptions, issue comments, or any public artifact:

- `Co-Authored-By: Claude …` trailers
- The strings `Claude`, `Anthropic`, `claude.com/claude-code`
- `🤖 Generated with [Claude Code]` footers

Three layers enforce this:

1. **Claude Code `PreToolUse` hook** (`.claude/settings.json`) — blocks `git commit` calls whose message contains the banned patterns.
2. **Local `commit-msg` git hook** (`.githooks/commit-msg`) — rejects the commit. Run `./scripts/install-hooks.sh` after fresh clone.
3. **`Commit Guard` GitHub Actions** (`.github/workflows/commit-guard.yml`) — fails the workflow on push/PR if any banned pattern slips through.

References to "Claude Code" _inside_ this CLAUDE.md describe how to operate the harness; that is fine. Authorship attribution is not.

## Devlog convention — update `/logs` on every change

`dapp/public/logs/index.html` is the project devlog (served at `/logs/` by Next.js). Every commit/PR that lands on `main` (or `staging`) should add a card. Card format — copy the existing pattern, newest at the top of `<main id="log-stream">`:

```html
<article class="log-card" data-date="YYYY-MM-DD">
  <header>
    <time datetime="YYYY-MM-DD">YYYY-MM-DD</time>
    <span class="log-tag" data-tag="feat"
      >feat | fix | chore | docs | refactor</span
    >
  </header>
  <h3>One-line summary of what changed</h3>
  <p>Two or three sentences on the why and the user-visible effect.</p>
</article>
```

The `pre-push` hook will warn (not block) for non-chore/docs commits that don't touch this file.

## Repo structure

```text
dapp/               → Next.js 16 App Router frontend (React 19, Tailwind 4, shadcn/ui)
publish/            → Move package publish scripts (deploy + unsigned bytes for multi-sig)
integration-tests/  → E2E tests with TestContainers (Postgres + Sui localnet)
move/               → Move contracts (placeholder — add packages here)
examples/           → Read-only reference implementations (coin, counter backend)
.claude/            → AI agent config: rules and skills
```

Workspace packages: `dapp`, `publish`, `integration-tests`. Examples live outside the workspace.

## Commands

### Root

| Command                   | Purpose                                 |
| ------------------------- | --------------------------------------- |
| `pnpm install`            | Install all workspace dependencies      |
| `pnpm test`               | Run tests across all workspace packages |
| `pnpm lint`               | Lint all packages                       |
| `pnpm format`             | Format with Prettier                    |
| `pnpm format:check`       | Check formatting                        |
| `pnpm run start_localnet` | Start local Sui network with faucet     |

### Dapp (`dapp/`)

| Command               | Purpose                      |
| --------------------- | ---------------------------- |
| `pnpm dev`            | Dev server (Turbopack)       |
| `pnpm dev:preview`    | Dev with `.env.preview`      |
| `pnpm dev:production` | Dev with `.env.production`   |
| `pnpm build`          | Production build (Turbopack) |
| `pnpm test`           | Run Vitest                   |
| `pnpm test:watch`     | Vitest in watch mode         |
| `pnpm lint`           | ESLint                       |

### Publish (`publish/`)

| Command                 | Purpose                                           |
| ----------------------- | ------------------------------------------------- |
| `pnpm run deploy`       | Build and publish Move package to network         |
| `pnpm run deploy-bytes` | Build unsigned publish tx bytes for multi-sig/KMS |

### Integration tests (`integration-tests/`)

| Command             | Purpose                                          |
| ------------------- | ------------------------------------------------ |
| `pnpm test`         | Full run (spins up containers, publishes, tests) |
| `pnpm run test:hot` | Watch mode (reuses running containers)           |

## Tech stack

- **Runtime:** Node 24 (`.nvmrc`, package engines, CI), pnpm workspaces
- **Frontend:** Next.js 16 (App Router, Turbopack), React 19, TypeScript 5.9
- **Styling:** Tailwind CSS 4, shadcn/ui (new-york), Lucide icons
- **Blockchain:** @mysten/sui, @mysten/dapp-kit-react, @mysten/enoki
- **Testing:** Vitest 4 (dapp + integration)
- **Move:** Sui CLI, MVR CLI, Sui Client Gen

## Conventions

- TypeScript strict mode. Path alias `@/*` → `./src/*` in the dapp.
- `"use client"` only on files that use hooks, event handlers, or browser APIs.
- Formatting enforced by Prettier (`.prettierrc`) and Move plugin — run `pnpm format`.
- Linting enforced by ESLint (`next/core-web-vitals` + `next/typescript`).
- App Router files in `dapp/src/app/` are server components by default. Keep `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, and `not-found.tsx` server-side unless the route file itself truly needs browser APIs; move wallet/browser logic to child components.
- Next.js 16 request APIs are async. In App Router pages and metadata functions, treat `params` and `searchParams` as promises and `await` `headers()` / `cookies()` where applicable.
- Prefer server reads in App Router pages and child server components. Keep wallet-signed on-chain transactions in client components via dApp Kit. Use route handlers for secrets, health checks, webhooks, and public/proxy APIs.
- Avoid waterfalls in pages and route handlers: start independent work early, use `Promise.all()`, and stream slower sections behind `Suspense`.
- Keep server-to-client props serializable and narrow. Do not pass `Transaction` instances, Sui client instances, Maps/Sets, functions, or duplicate transformed copies of the same data across the RSC boundary.
- Prefer the existing TanStack Query layer in `dapp/src/contexts/SuiProvider.tsx` or dApp Kit hooks over ad hoc `useEffect` + `fetch` client code.
- Keep `next/font` setup centralized in `dapp/src/app/layout.tsx` or a shared font module. For app images or NFT media, prefer `next/image`, explicit dimensions or `fill` plus `sizes`, and normalize remote or `ipfs://` URLs before rendering.
- For public pages, add metadata in server files and prefer file-based metadata assets in `dapp/src/app/` (`favicon.ico`, `opengraph-image`, `robots`, `sitemap`) when static files are sufficient.

## Git workflow

- The repo README and workflows use `main` for production/mainnet and `staging` for pre-production/testnet.
- Feature branches generally start from `staging`; hotfix branches start from `main`.
- Keep branch-process changes aligned with `README.md` and `.github/workflows/` unless the user is explicitly changing the release process.
- Example branch protection in `README.md` uses squash or rebase merges, status checks, and Vercel preview requirements.

## CI/CD

Three workflows run on PR/push to `main` and `staging`:

1. **dapp-tests** — `pnpm test` in `dapp/`
2. **integration-tests** — `pnpm test` in `integration-tests/`
3. **format-check** — `pnpm format:check` at root

Workflows use `.nvmrc` for Node setup so local and CI runtimes stay aligned.

## Gotchas

- `dapp/src/config/clientConfig.ts` has `"use client"` — never import it in API routes or server-side code. Use `process.env` directly in API routes.
- Integration tests require Docker running — they will hang without it.
- Local `.env*` files can silently override preview or production configs pulled with Vercel.
- The `move/` directory is an empty placeholder (`.keep` file only). Use the `scaffold-move-package` skill to add contracts.
- `integration-tests/test/config.ts` currently points at `examples/counter-backend-e2e-test/move/counter`. Update that path when wiring the suite to a real package under `move/`.
- `publish/data/` is gitignored output — do not treat `publish.json` or `publish-bytes.txt` as source files.
- In App Router, `route.ts` and `page.tsx` cannot live in the same route segment.
- Client components that read `useSearchParams()` should usually be wrapped in `Suspense` from a parent server component to avoid a full CSR bailout.

## Verification

For frontend or API changes, run:

```bash
pnpm format && cd dapp && pnpm lint && pnpm test && pnpm build
```

If you changed integration tests, also run:

```bash
cd integration-tests && pnpm test
```

Success: the relevant commands exit 0. The `cd dapp && pnpm build` step catches missing env vars via Zod validation.

## Constraints

- Do not commit `.env` files (only `.env.example`, `.env.devnet`, `.env.testnet`, `.env.mainnet`).
- Do not modify files in `examples/`.
- Keep `components.json` in sync with `globals.css` design tokens.

## Task routing

| Task                                        | Mechanism                                                      |
| ------------------------------------------- | -------------------------------------------------------------- |
| Create a new Move contract                  | Skill: `scaffold-move-package`                                 |
| Add a frontend page or feature              | Skill: `add-dapp-page`                                         |
| Add Swagger/OpenAPI docs to API routes      | Skill: `add-swagger-docs`                                      |
| Deploy/publish a Move package               | Skill: `publish-move-package` (manual only)                    |
| Edit App Router pages, layouts, or metadata | Rule: `.claude/rules/app-router-pages.md` loads automatically  |
| Edit React components                       | Rule: `.claude/rules/react-components.md` loads automatically  |
| Edit API routes                             | Rule: `.claude/rules/api-routes.md` loads automatically        |
| Edit dapp test files                        | Rule: `.claude/rules/dapp-testing.md` loads automatically      |
| Edit integration test files                 | Rule: `.claude/rules/integration-tests.md` loads automatically |
| Edit Move contracts                         | Rule: `.claude/rules/move-contracts.md` loads automatically    |
| Edit env config or `.env.example`           | Rule: `.claude/rules/env-config.md` loads automatically        |

These rules now target concrete repo paths under `dapp/`, `publish/`, `integration-tests/`, and `move/`. Keep them in sync if the template layout changes.
