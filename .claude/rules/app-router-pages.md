---
paths:
  - "dapp/src/app/**/page.*"
  - "dapp/src/app/**/layout.*"
  - "dapp/src/app/**/loading.*"
  - "dapp/src/app/**/error.*"
  - "dapp/src/app/**/not-found.*"
  - "dapp/src/app/**/default.*"
  - "dapp/src/app/**/template.*"
  - "dapp/src/app/**/favicon.*"
  - "dapp/src/app/**/icon.*"
  - "dapp/src/app/**/apple-icon.*"
  - "dapp/src/app/**/manifest.*"
  - "dapp/src/app/**/opengraph-image.*"
  - "dapp/src/app/**/twitter-image.*"
  - "dapp/src/app/**/robots.*"
  - "dapp/src/app/**/sitemap.*"
---

# App Router Page Rules

Treat this rule in two layers:

- **Hard App Router constraints** are framework-level requirements or common correctness traps.
- **Recommended template defaults** are the starting point for this template, but a real project can intentionally choose a different implementation when there is a clear reason.

## Hard App Router Constraints

- Metadata is server-only. Export `metadata` or `generateMetadata` from server files, not client components.
- In Next.js 16, `params` and `searchParams` are async in page and metadata entry points. Type them as promises and `await` them. When using `headers()` or `cookies()`, `await` those too.
- `route.ts` and `page.tsx` cannot live in the same route segment.
- Keep server-to-client props serializable. Do not pass functions, `Transaction` instances, Sui client instances, Maps, Sets, or class instances across the RSC boundary.
- Do not swallow `redirect()`, `notFound()`, `forbidden()`, or `unauthorized()` inside generic `try/catch` blocks.

## Recommended Template Defaults

- Keep App Router route files server-side by default. `page.*`, `layout.*`, `loading.*`, `error.*`, `not-found.*`, and metadata files should stay server components unless the route file itself truly needs browser APIs.
- Move wallet hooks, browser APIs, and other client-only behavior into child components under `dapp/src/components/general/` instead of marking the whole route `"use client"`.
- Prefer server reads in route files and child server components. Keep wallet-signed on-chain transactions in client components using dApp Kit.
- Prefer file-based metadata assets in `dapp/src/app/` (`favicon`, `icon`, `apple-icon`, `manifest`, `opengraph-image`, `twitter-image`, `robots`, `sitemap`) when static files are enough.
- If the same loader powers both a page and `generateMetadata`, use `cache()` to avoid duplicate non-fetch work. `fetch()` calls are already request-memoized; `cache()` is most useful for auth, DB, filesystem, and other shared loaders.
- Start independent server work early, use `Promise.all()`, and avoid waterfalls.
- If only part of the page is slow, keep the route shell synchronous and stream the slow section behind `Suspense`.
- Wrap client components that use `useSearchParams()` or other URL-driven navigation hooks in `Suspense` from a parent server component so the entire route does not bail out to CSR.
- Keep server-to-client props narrow. Pass only the fields the client component actually renders.
- Keep `next/font` setup in the root layout or a shared font module, not in leaf feature components.
- Use `next/image` for application and NFT/media rendering when feasible, with explicit dimensions or `fill` plus `sizes`, and normalize `ipfs://` or remote media URLs before rendering.
- Use `Link` for internal navigation instead of raw `<a>` tags.
- Use route-local `_components/` folders for helpers that only belong to one segment.

## References

- Follow `dapp/src/app/layout.tsx` for server layout plus client provider composition.
- Follow `.claude/skills/add-dapp-page/templates/page-with-suspense.tsx` for server-first streaming page patterns.
- After changes, run `cd dapp && pnpm lint` and `cd dapp && pnpm build`.
