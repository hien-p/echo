# Echo — Decentralized Feedback & Form Platform

**Walrus-native forms with on-chain composability.** Build a form, share a link, collect rich feedback (markdown + screenshots + videos), keep submissions encrypted with Seal, ask questions across the answers with Memwal-powered RAG. Built for the **Walrus Sessions hackathon**.

> Nobody builds this on Google Forms.

## 🌐 Live

|                                                                                       |                                                                                                           |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **App**                                                                               | https://echo-20u.pages.dev                                                                                |
| **Leave us feedback**                                                                 | https://echo-20u.pages.dev/forms/0xfa5dce34f093b9eb42d098d0fbb747eb97b6a37bf20af370735db7c1c6163d73       |
| **Demo AdminOnly form** (toggle "Demo admin" in header to read encrypted submissions) | https://echo-20u.pages.dev/forms/0xf8927c63514fd018305ca1911737d3cdd7d00fd787db9a1503352b6eed2eaa31/admin |
| **Multisig demo form** (real 2-of-2 m-of-n threshold)                                 | https://echo-20u.pages.dev/forms/0x7536009392a40ca0e468b9ed10a080e3008f132a5df758c884aea3a3e92b8fb3/admin |
| **Insights / RAG**                                                                    | https://echo-20u.pages.dev/insights                                                                       |
| **Devlog**                                                                            | https://echo-20u.pages.dev/logs                                                                           |
| **Move package** (Sui testnet, audit-patched 2026-05-15)                              | `0x3df32d4afc11ba3ada2caf8a3c4edcd21076915e5da31877dedec0a520c7754a`                                      |

## 🏗️ What's actually built

**Five privacy tiers, all working end-to-end on testnet:**

1. **Public** — plaintext on Walrus, indexed for RAG
2. **AdminOnly** — Seal IBE; only the cap holder decrypts (verified live: 2.6s round-trip)
3. **Multi-admin (OR-of-N)** — `create_form` mints N caps to N addresses; any one can decrypt
4. **TimeLocked** — Seal time-lock; permissionless decrypt after the unlock timestamp; live countdown badge in UI
5. **Conditional** — encrypted with a custom on-chain rule (Move predicate is a stub)

**Submission features:**

- Rich-text markdown editor with **drag-drop image upload to Walrus**
- Screenshot / video / arbitrary file upload, inline preview
- Anonymous submit via deterministic nullifier (`SHA-256(walletSignature(formId))`); chain enforces 1-submit-per-wallet without learning the address
- Token / NFT / SuiNS gating
- Gas-sponsored via Enoki — respondents need no SUI

**Admin / analytics:**

- Bulk **"Reveal all"** decrypt (one wallet popup, parallel decrypt)
- Per-row Decrypt with permission-aware state ("🔒 No permission" when not authorized)
- Submission filter / sort / search / CSV export
- Memwal-backed RAG (`/insights`) with always-broad recall + content-hash dedupe
- `+5 reputation` button per row → mints on-chain `CreditTicket`

**Demo admin mode** — header toggle that lets visitors browse encrypted demo forms without connecting a wallet (server holds a designated demo key for showcase forms only; real users' forms stay wallet-gated).

**Devlog** — every commit lands a card on the in-app `/logs` page.

## 🧱 Architecture

```
Browser
  │
  ├── /forms/new ─── Walrus publisher proxy ──► schema.json + metadata.json blobs
  │                                              │
  │                                              ▼
  ├── create_form (sponsored)                  Sui Form object (shared, 8-arg)
  │
  ├── /forms/<id> respondent flow
  │     │
  │     ├── (optional) Seal encrypt locally with form's tier identity
  │     ├── upload payload bytes via /api/walrus/upload
  │     └── submission::submit (sponsored)  ──►  SubmissionRef on chain
  │
  └── /forms/<id>/admin
        │
        ├── browser-driven decrypt   (wallet signs SessionKey)
        ├── server-driven decrypt    (demo mode, server signs SessionKey)
        ├── Memwal index             /api/insights/index_form (server)
        └── RAG query                /api/insights/query  (OpenRouter + Memwal)
```

## 🚀 Try it locally

```bash
pnpm install
cp dapp/.env.example dapp/.env  # fill in MEMWAL_*, OPENROUTER_API_KEY for RAG
cp publish/.env.example publish/.env  # fill in ADMIN_SECRET_KEY (a funded testnet wallet)

cd dapp && pnpm dev
# → http://localhost:3333
```

To mint sample forms against the published package on testnet:

```bash
cd publish
FORM=feedback   pnpm exec env-cmd -f .env tsx src/scripts/createSampleForm.ts
FORM=admin      pnpm exec env-cmd -f .env tsx src/scripts/createSampleForm.ts
FORM=timelocked pnpm exec env-cmd -f .env tsx src/scripts/createSampleForm.ts

# Seed scripted submissions (real on-chain txs, generated content):
FORM_ID=0x... COUNT=3 pnpm exec env-cmd -f .env tsx src/scripts/seedSubmissions.ts
```

## 📦 Repo layout

| Path                          | What                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `dapp/`                       | Next.js 16 frontend (React 19, Tailwind 4, dApp Kit)                           |
| `move/echo/`                  | 4 Move modules: `form`, `submission`, `bounty`, `reputation`. 18 tests passing |
| `publish/`                    | Move package publish + sample-data scripts                                     |
| `integration-tests/`          | TestContainers e2e (Sui localnet + Postgres)                                   |
| `dapp/public/logs/index.html` | Self-hosted devlog at `/logs`                                                  |

## 🌍 Walrus Sites deploy (hybrid)

Echo is built dual-target: a static SPA on **Walrus Sites** for the
frontend, calling **Cloudflare Pages**'s API routes for server-only
features (Memwal RAG, Enoki gas sponsorship, Walrus publisher proxy,
demo decrypt). Both deploys share one Move package on Sui testnet.

```
Walrus Sites (echo.wal.app)        Cloudflare Pages (echo-20u.pages.dev)
  ├── /              ────┐           ├── /api/insights/*    (RAG)
  ├── /forms/...     ────┤           ├── /api/walrus/upload (publisher proxy)
  ├── /forms/new     ────┤           ├── /api/sponsor       (Enoki)
  ├── /dashboard     ────┘           └── /api/demo/admin    (demo decrypt)
  ↓ all client-side                          ↑
  ↓ direct to Sui RPC                        │  fetch with CORS
  ↓ direct to Walrus aggregator              │
  ↓ direct to Seal key servers ──────────────┘
```

**Build the static SPA** for Walrus Sites:

```bash
cd dapp
NEXT_PUBLIC_API_BASE_URL=https://echo-20u.pages.dev pnpm build:walrus
# → dapp/out/  (consumed by site-builder)
```

The script (`dapp/scripts/build-walrus.sh`) temporarily moves
`src/app/api/` and `src/middleware.ts` aside (Next.js refuses
`output: "export"` while API routes exist) and strips
`runtime = "edge"` from page files (edge runtime is incompatible with
static export). Both are restored on EXIT, success or failure.

**Status — fully working** (build green; manual `site-builder publish`
still pending a real demo deploy):

- ✅ `NEXT_PUBLIC_API_BASE_URL` plumbing (every client-side `fetch("/api/...")`
  routes through `apiUrl()` in `dapp/src/config/clientConfig.ts`)
- ✅ CORS middleware on `/api/*` so cross-origin calls from `*.wal.app` work
- ✅ `pnpm build:walrus` script (dedicated `.next-walrus/` cache so it
  doesn't clobber `pnpm dev`'s `.next/`)
- ✅ Static export of every static route + a `/forms/_/` (and
  `/forms/_/admin/`) SPA-fallback stub. The build script:
  - parks `src/app/api/`, `src/middleware.ts`, and `src/app/s/` (server-
    only — the redirect-driven SuiNS shareable links don't apply on a
    static host)
  - strips `runtime = "edge"` from page files (incompatible with
    `output: "export"`)
  - injects `generateStaticParams()` + `dynamicParams = false` into the
    dynamic form-id routes (Next 15 requires both, but also refuses
    them alongside `runtime = "edge"`, so they can only live in the
    build, not the source)
  - restores everything via `trap` on EXIT, success or failure
- ✅ `useResolvedFormId` hook reads `window.location.pathname` at
  hydration time so the stub `/forms/_/` page resolves to the real
  form id after the host serves it as a fallback for `/forms/0xabc/`
- ✅ `dapp/ws-resources.yaml` configures Walrus Sites' SPA-fallback
  routes so unknown form URLs land on the stub

To publish:

```bash
site-builder publish ./dapp/out --epochs 30 \
  --ws-resources dapp/ws-resources.yaml
# → returns a Sui object id; map it to a SuiNS name for echo.wal.app
```

## 🧪 Tests

```bash
sui move test --path move/echo            # 26 Move tests (22 baseline + 4 audit regressions)
cd dapp && pnpm test                      # 21 dapp tests
cd integration-tests && pnpm test         # full e2e (needs Docker)
```

## 🛡️ Trust model

| Tier              | On-chain guarantee                                                                   | Trusts                                       |
| ----------------- | ------------------------------------------------------------------------------------ | -------------------------------------------- |
| Public            | none — plaintext on Walrus                                                           | Walrus availability                          |
| AdminOnly         | only the `FormOwnerCap` holder decrypts                                              | Cap-holder key custody, Seal key servers     |
| Threshold OR-of-N | any one of N caps decrypts (`threshold_n == 1`)                                      | Any cap holder, Seal key servers             |
| Threshold m-of-n  | k unique `ApprovalWitness` objects required (real cryptographic primitive)           | k cap holders coordinating, Seal key servers |
| TimeLocked        | permissionless decrypt after `unlock_ms`; create-time guard against `unlock_ms == 0` | Sui clock, Seal time-lock servers            |
| Conditional       | currently collapses to AdminOnly semantics — see "Known limitations"                 | Same as AdminOnly                            |

Walletless respondents: ephemeral Ed25519 keypair held in browser, gas sponsored by Enoki. Trust set = the dapp origin + Enoki. Submission ciphertext is content-addressed on Walrus; chain stores the blob id + a `tier_hint` (audit fix F-04) so a misbehaving client can't claim a tier they didn't encrypt under.

## ⚠️ Known limitations (v1 disclosures)

This package was hardened after a third-pass security audit on 2026-05-15 (see `plans/reports/security-audit-260515-move-contracts.md`). The audit's must-fix and should-fix patches all landed in package `0x3df32d4a…0c7754a`. **Two items intentionally deferred to v1.1:**

- **F-01 — Threshold m-of-n witnesses authorize one Seal identity permanently.** `seal_approve_threshold_m_of_n` consumes a `vector<ApprovalWitness>` inside Seal's dry-run, so `object::delete` never actually persists. The shared witnesses remain on chain and the same set re-decrypts forever. Semantics is "k of n voted to release this Seal identity once" — not "k of n per read". v1.1 will bind each witness set to a single `SubmissionRef.id` (or add `expires_ms` with a `Clock` check) so a quorum decrypts exactly one submission. See `form.move:259-268` for the documented file-header note.
- **F-08 — Conditional tier policy is a stub.** `seal_approve_conditional` enforces the same predicate as `seal_approve_admin_only`; `conditional_policy_id` is stored but unread. v1.1 will ship a `ConditionalPolicyWitness` pattern mirroring `ApprovalWitness` so an off-chain oracle posts a witness when conditions are met.

The audit's full finding list (F-01 through F-15) and per-tier threat model are in the audit report. Highlighted regressions are covered by 4 new Move tests:

- `seal_approve_threshold_aborts_when_k_above_one` (F-02 — was a complete m-of-n bypass)
- `create_time_locked_with_zero_unlock_aborts` (F-07)
- `submit_with_wrong_tier_hint_aborts` (F-04)
- `seal_approve_admin_only_aborts_when_archived` (F-03)

## 📝 Submission

- **App**: https://echo-20u.pages.dev
- **Source**: this repo
- **Devlog**: https://echo-20u.pages.dev/logs
- **Real feedback collected on Echo itself** (please leave one!): https://echo-20u.pages.dev/forms/0xfa5dce34f093b9eb42d098d0fbb747eb97b6a37bf20af370735db7c1c6163d73

---

## Original template README

## Prerequisites

1. Use the correct node version in [.nvmrc](.nvmrc):

```bash
nvm use
```

2. Install the [sui cli](https://docs.sui.io/guides/developer/getting-started/sui-install)
3. Install the [MVR cli](https://docs.suins.io/move-registry/tooling/mvr-cli)
4. Install the [Mysten Codegen](https://sdk.mystenlabs.com/codegen)

## Project Structure

This project is a monorepo utilizing [pnpm workspaces](https://pnpm.io/workspaces)

The project is comprised by 5 main directories:

1. [dapp](dapp): This directory holds a NextJS dapp starter template
2. [move](move): This directory is just a placeholder. You should store your Move contracts here.
3. [publish](publish): This directory holds a NodeJS project with helpful scripts to publish your contracts.
4. [integration-tests](integration-tests): This directory holds a NodeJS project with helpful scripts to publish and test the contracts in a temporary env using [TestContainers](https://testcontainers.com/).
5. [examples](examples): This directory holds simplified examples of dapps/backends/contracts that use the best practices.

### QuickStart

## Git Workflow

We follow a structured git workflow to ensure our codebase works smoothly across multiple environments (production, staging) and to make post-launch maintenance easier.

### Branches

#### Long-Living Branches

| Branch    | Environment | Sui Network | Description                                                                                                                                  |
| --------- | ----------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `main`    | Production  | mainnet     | Deployed to production (automatically on each push). Connected to Sui mainnet and holds stable, release-ready code.                          |
| `staging` | Staging     | testnet     | Used for testing and QA before production. Connected to Sui testnet. All new features are merged and tested here before promotion to `main`. |

#### Support Branches

| Branch Type                    | Origin    | Target    | Purpose                                                                                                                                                         |
| ------------------------------ | --------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feature/*` or `author-name/*` | `staging` | `staging` | For new features or enhancements. Each feature branch is created from `staging`, tested via staging deployments, and merged back into `staging` once validated. |
| `hotfix/*` or `author-name/*`  | `main`    | `main`    | For urgent fixes to production. Created directly from `main`, merged back to `main`, and immediately back-merged to `staging` to keep histories in sync.        |

> **Note:** Branch naming convention (`feature/*` vs `author-name/*`) is pending final decision and will be determined separately.

### Branch Protection Rules

Ensure your repository has the same branch protection ruleset configured as the [dapp-template repository](https://github.com/MystenLabs/dapp-template/settings/rules/8725524). This helps maintain code quality and prevents accidental pushes to protected branches.

### CI/CD: Vitest PR Checks

This template includes GitHub Actions that run Vitest tests on every PR, for testing:

- The endpoints of your [dapp](dapp)
- The integration tests in the [integration-tests](integration-tests) directory

#### 1. Create the workflow files

- Copy [`.github/workflows/integration-tests.yml`](.github/workflows/integration-tests.yml) and [`.github/workflows/dapp-tests.yml`](.github/workflows/dapp-tests.yml) to your repository root.

#### 2. Add GitHub Secrets

In the case that your dapp tests need secret env vars, go to your repository: **Settings → Secrets and variables → Actions → Repository secrets → New repository secret**

Add these secrets (values from your `.env`):
| Secret Name | Description |
|-------------|-------------|
| `NEXT_PUBLIC_SUI_NETWORK` | `testnet` or `mainnet` |
| `NEXT_PUBLIC_SUI_FULLNODE_URL` | Your Sui RPC URL |

Add any additional secrets your app requires.

#### 3. Require status checks (recommended)

To block PRs from merging until tests pass:

1. Go to **Settings → Rules → Rulesets → New branch ruleset**
2. Name: `test-covered`
3. Target branches: `main` (and `staging` if needed)
4. Enable **"Require status checks to pass"**
5. Search and add the `test` check (only appears after the workflow has run once)
6. Click **Create**

> **Tip:** The `test` check won't appear in the dropdown until the workflow has run at least once. Create a test PR first to trigger it.

### Environment Variables

- Each deployment environment (Vercel, Pulumi, etc.) manages its own environment variables
- `.env.example` is committed to the repository as a reference template only
- Real `.env` files are git-ignored and environment-specific

**Important:** Never hardcode network values (e.g., `"testnet"`) in code. Always use environment variables like `SUI_NETWORK` for network-specific configurations

### Ruleset json file

To use the ruleset you can import the following json file into the github repository on the settings page.

```json
{
  "id": 8725524,
  "name": "gitflow",
  "target": "branch",
  "source_type": "Repository",
  "source": "MystenLabs/dapp-template",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "exclude": [],
      "include": ["refs/heads/main"]
    }
  },
  "rules": [
    {
      "type": "deletion"
    },
    {
      "type": "non_fast_forward"
    },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": false,
        "required_reviewers": [],
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true,
        "automatic_copilot_code_review_enabled": false,
        "allowed_merge_methods": ["squash", "rebase"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          {
            "context": "Vercel",
            "integration_id": 8329
          }
        ]
      }
    },
    {
      "type": "copilot_code_review",
      "parameters": {
        "review_on_push": false,
        "review_draft_pull_requests": false
      }
    },
    {
      "type": "required_deployments",
      "parameters": {
        "required_deployment_environments": ["Preview"]
      }
    },
    {
      "type": "copilot_code_review"
    }
  ],
  "bypass_actors": []
}
```
