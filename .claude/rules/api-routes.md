---
paths:
  - "dapp/src/app/api/**/*.ts"
---

# API Route Rules

- Use route handlers only for server-only concerns: secrets, health checks, webhooks, proxying, or public/external APIs. Do not add API routes just to wrap wallet-signed client transactions.
- Export named handler functions (`GET`, `POST`, `PUT`, `DELETE`), not a default export.
- Add `export const dynamic = "force-dynamic"` for non-cacheable endpoints.
- Keep the default Node runtime unless an endpoint is intentionally Edge-compatible and latency-sensitive.
- Never expose `ADMIN_SECRET_KEY` or other secrets to client-side code.
- Read request-specific cookies or headers with the Next.js 16 async APIs when you use `cookies()` or `headers()`. Prefer `request.headers` when the raw `Request` already has what you need.
- Return responses with `NextResponse.json()` and explicit status codes.
- Keep handlers thin. Extract shared server logic to `dapp/src/lib/` or a nearby server-only module.
- Short-circuit early. If a branch returns early, defer expensive awaits until after that check.
- Use `after()` from `next/server` for non-critical side effects such as analytics, audit logs, notifications, or cleanup so the main response is not blocked.
- Hoist static I/O (templates, fonts, config files, static assets) to module scope instead of re-reading it on every request.
- If you add Server Actions later, treat them like public endpoints: validate input, authenticate, and authorize inside the action itself.

## Async Performance

- Start independent async work early and await it late.
- Use `Promise.all()` for independent calls; avoid serial `await`s when order does not matter.
- When one async call is only needed in one branch, move that `await` into the branch instead of blocking every request path.

```typescript
export async function GET(request: Request) {
  const sessionPromise = auth();
  const configPromise = fetchConfig();
  const session = await sessionPromise;
  const [config, data] = await Promise.all([
    configPromise,
    fetchData(session.user.id),
  ]);
  return NextResponse.json({ data, config });
}
```

## References

- Follow `dapp/src/app/api/health/route.ts`.
- Every new API route should have a matching test in `dapp/test/`.
- In App Router, `route.ts` cannot live beside `page.tsx` in the same folder; put route handlers under an `api/` segment or a separate branch.
- After changes, run `cd dapp && pnpm test` and `cd dapp && pnpm lint`.
