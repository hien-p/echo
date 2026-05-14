# Dashboard UI/UX Audit — 260512

Route: `/dashboard` · staging: https://staging.echo-20u.pages.dev/dashboard
Commits in flight: `157f887` (Synex hero) → `2653504` (WalrusBlobs + preview) → `252dad9` (donut + bar list + sparkline).

---

## 1. TL;DR

- **Three palettes are fighting on one page.** Warm paper `#F2F2F0` editorial hero → matte‑black Swiss bento `#050505` → shadcn pure‑white card on light root → tiny dark inner table. Every scroll boundary is a context switch. That alone is the "kho nhin nhieu" feeling.
- **There are now three "overview" zones doing the same job.** `DashboardHero.LivePreviewCard` + `SwissBentoOverview` + `BentoDashboard` all show forms/submissions/tiers. The bento "ít số liệu" complaint is real — the _data_ is spread across three competing grids instead of one rich one.
- **Type scale is inverted.** The hero shouts at 68px while the actual operator surface (`CrossFormDashboard`) is `text-xs`/`text-[10px]` — that's the "text qua nho." Operators spend 95% of their time below the fold, on the smallest text.
- **No real time-series of activity.** Despite three charts, none answers "how many submissions came in today / this week / per form over time." `SwissBentoOverview.chartData` buckets `created_ms` of _forms_, not submissions — the area chart is essentially fake.
- **Single highest-leverage fix:** kill the SwissBentoOverview _and_ the warm‑paper hero on `/dashboard`. Ship one cohesive dark "operator console" (Linear/Posthog‑coded) that uses the hero zone for genuine KPIs + a real submissions‑over‑time chart, then bento, then triage. Keep warm‑paper editorial for marketing routes (`/`, `/forms/new`) only.

---

## 2. Diagnosis

### 2.1 Visual / palette incoherence

| Zone            | File                         | bg                               | text              | aesthetic             |
| --------------- | ---------------------------- | -------------------------------- | ----------------- | --------------------- |
| Hero            | `EditorialHero.tsx:73`       | `#F2F2F0` paper                  | `#05050C` ink     | Synex/Apple editorial |
| Preview card    | `DashboardHero.tsx:182`      | `bg-white`                       | `#05050C`         | Floating SaaS card    |
| Swiss bento     | `SwissBentoOverview.tsx:183` | `bg-[#050505]`                   | `text-white/X`    | Vercel/Linear dark    |
| Bento dashboard | `BentoDashboard.tsx:259`     | inherits `bg-background` (light) | `text-foreground` | shadcn light          |
| Triage          | `CrossFormDashboard.tsx:792` | inherits light                   | `text-foreground` | dense table           |

Five surfaces, three palettes, two color modes (`globals.css:87-179` ships a light root and `.dark` variant but `next-themes` defaults appear inconsistent). The transition from `#F2F2F0` → `#050505` → `#FFFFFF` in three viewport heights is what "kho chiu" feels like.

### 2.2 Redundant overviews

- `DashboardHero.LivePreviewCard` (`DashboardHero.tsx:169-227`) — forms / submissions / encrypted.
- `SwissBentoOverview.SubmissionsHeroCard` (`SwissBentoOverview.tsx:243-292`) — total submissions + (fake) 30d.
- `BentoDashboard` hero tile (`BentoDashboard.tsx:261-312`) — total submissions + per-form bar.

Same three numbers in three different aesthetics within ~1200px of scroll. That is the structural reason it feels "qua xau."

### 2.3 Type hierarchy inversion

- Hero ghost+solid: `text-[34px..68px]` (`EditorialHero.tsx:118,127`).
- Bento hero number: `clamp(4.5rem,11vw,9rem)` (`BentoDashboard.tsx:280`) — up to **144px**.
- Triage row text: `text-sm`, status pill `text-[10px]`, sidebar headings `text-[10px]` (`CrossFormDashboard.tsx:798, 898, 931, 1049`). Members chip `text-[10px] font-mono` (line 1367).
- "Triage queue" section label: `text-xs` (`page.tsx:30`).

The page literally yells "Sealed end-to-end" then whispers the actual data. Operators triaging encrypted submissions cannot read 10px badges — and there are _seven_ `text-[10px]` and `text-[9px]` instances in `CrossFormDashboard.tsx` alone.

### 2.4 Chart fidelity is a demo

`SwissBentoOverview.chartData` (`SwissBentoOverview.tsx:148-171`) buckets by `created_ms` of forms — not submissions. With <10 forms the chart is mostly zeros, padded by `submission_count / 5` smeared onto the form's creation day. A senior reviewer will recognise this as a "fake series" — exactly the credibility problem at a hackathon demo.

`BentoCharts.MiniBars` (`BentoCharts.tsx:229-265`) shows distribution-by-form, not by-time. The donut shows tier mix. The bar list shows top forms. Three charts, **zero time-series**, **zero per-day signal**. That's what's missing when the user says "khong co charts" — they mean _real_ charts.

### 2.5 Token traps already biting

- `globals.css:50-74` reassigns `--spacing-xs..5xl` so `max-w-xl/2xl/3xl` resolve to spacings (24/32/56/64px). `EditorialHero.tsx:151` already worked around this with `max-w-[460px]`. `LockedShell` in `CrossFormDashboard.tsx:1318` uses `max-w-[640px]` — fine. But anywhere new code uses `max-w-3xl` etc. will silently break.
- `LockedShell` uses `p-md` (line 1318) which now means **32px** — that's a coincidence, not a guarantee.

### 2.6 Misc breaks

- `EditorialHero.tsx:172` floats `LivePreviewCard` absolutely at `bottom-0`; with the `220px` bottom dark fade (`line 181`) the card sits _inside_ the fade and reads slightly muddy against the gradient.
- `WalrusBlob` z-index stack: left=1, center-back=0, right=4 (`WalrusBlob.tsx:83`). The preview card is `z-[3]` (`EditorialHero.tsx:169`). Right blob (`z=4`) overlaps the preview card on narrow viewports — visible in the screenshot the user objected to.
- `BentoDashboard.tsx:550-556` defines `tierLabels` but never references it — dead code (lint-only, but a sign of trim happening).
- `SwissBentoOverview` is server-rendered into a dark `bg-[#050505]` band that has no top/bottom transition — it's a hard color seam against whatever sits above and below.

---

## 3. What's missing (prioritized)

### 🔥 Critical for a hackathon-quality demo

1. **Real submissions-over-time chart** — area or step chart from the on-chain `SubmissionMade` events `CrossFormDashboard` already queries (`CrossFormDashboard.tsx:265-323`). Group by hour for last 24h, by day for last 30d. Recharts is already installed.
2. **Decryption / approval queue tile** — m-of-N progress is already computed (`approvalsByFormQuery`, line 440) but only surfaces inside `FormDetailPanel`. Promote it: "3 forms awaiting approval · 5/9 shares collected."
3. **Bounty TVL tile** — `bountyTotalsQuery` (line 374) is read inline as plain text. This is a hackathon-judge-magnet metric. Show SUI TVL with a trend sparkline + pool count.
4. **One coherent KPI strip** replacing the three overlapping overviews. Four tiles: Submissions (24h delta) · Open forms · TVL · Awaiting decrypt.

### ⚡ High ROI

5. **GitHub-style submissions heatmap** (52 weeks × 7 days). Pure CSS grid, no library. Reads the same `submissionsQuery` data. Tells the engagement story instantly.
6. **Live new-submission banner** — the diff is already computed (`CrossFormDashboard.tsx:500-549`) and pushed to toast; surface a persistent "● 3 new this hour" pill in the hero zone too.
7. **Top contributors leaderboard** — already grouping by submitter is one line over `submissionsQuery.data`. Wallet → SuiNS → submission count. Anonymous bucket separated.
8. **Quick-filter pills above the triage queue** — pre-built scopes: "Encrypted only," "Last 24h," "Awaiting decrypt," "My replies needed." Currently filtering requires three separate UI interactions (status strip + submitter pills + form sidebar).
9. **Form-health badge** per row — engagement = submissions per day since `created_ms`. Cheap to compute, lets operators spot the form that needs nudging.
10. **Empty-state walkthrough** — `BentoDashboard.tsx:231-256` shows a 12-line "no forms yet" panel. Replace with a 3-step illustrated "create → share → triage" preview that uses the actual sample data already in the no-wallet branch (line 184).

### 💎 Polish

11. **Tier-aware iconography beyond colored dots** — current dots/chips are tiny (`text-[10px]`). Use a tiered Walrus glyph mini-set (already have `WalrusBlob`; produce 5 monochrome 16px variants).
12. **Density toggle** (Comfortable/Compact) — Linear-style. Persist to localStorage. The triage queue alternates between needing density (>50 rows) and breathing room (≤10).
13. **Saved views** — name+pin a filter combination.
14. **Inline submission preview drawer** — open right-side drawer on row click instead of bouncing to `/forms/{id}/admin`.
15. **Realtime ping animation** — the green dot in `LivePreviewCard.tsx:194` is static. Use the same `animate-ping` pattern from `SwissBentoOverview.tsx:421-423`.

---

## 4. Color + style recommendation — **Option C (premium SaaS admin)**

Keep the warm-paper editorial aesthetic for `/`, `/forms/new` flow, and any other marketing-side surface where Echo's "soft, human, sealed" identity sells. For `/dashboard` — an admin console — rebuild as a **Linear/Posthog/Vercel-coded dark operator surface** with a _deliberate_ visual handoff: the editorial hero stays but compresses to `min(60vh, 540px)`, then steps down into a unified dark interior. No more warm→dark→light→light flicker.

### Why Option C over A or B

- **A (warm paper everywhere)** loses tier color contrast (emerald/blue/violet/amber/rose all flatten on `#F2F2F0`) and signals "blog" not "console." Operators won't stare at warm paper for 30 minutes.
- **B (dark hero too)** kills Echo's #1 differentiator screenshot — the Walrus blobs with their amber decrypt reveal. That hero is genuinely good marketing material; gutting it for an admin route trades a unique asset for generic darkness.
- **C** keeps the brand moment on entry, then commits to a single dark operator surface for the 90% of time the user is actually working.

### Tokens (paste into `dapp/src/app/globals.css` under `.dark` and a new `:root[data-route="dashboard"]` selector, or just enforce `<html className="dark">` for this route via the `ThemeProvider`)

```
--bg              : #0A0A0B      /* page */
--surface         : #111114      /* card */
--surface-elev    : #18181C      /* card hover / dropdown */
--border          : #26262C      /* hairline */
--border-strong   : #34343C      /* focused / selected */
--text-primary    : #F4F4F5      /* body */
--text-muted      : #9CA0AA      /* labels, secondary copy */
--text-faint      : #5C616C      /* timestamps, dividers */
--accent          : #5B8DEF      /* primary CTA, focus ring */
--accent-soft     : #5B8DEF1F    /* hover bg, ring 12% */
--success         : #34D399      /* (existing emerald-400, keep) */
--warning         : #FBBF24      /* (existing amber-400, keep) */
--danger          : #FB7185      /* (existing rose-400, keep) */
--info            : #60A5FA      /* (existing blue-400, keep) */
```

Tier hexes stay (`BentoCharts.tsx:26-32`) — they're already correct and used app-wide.

### Fonts

- Display: keep `var(--font-inter-tight)` (`globals.css:14`) for hero H1.
- UI: Inter via `var(--font-geist-sans)` for all admin chrome — already installed.
- Mono: `var(--font-geist-mono)` for addresses, blob ids, package hashes — extend the Swiss bento pattern.

### Spacing rhythm

4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 — the existing scale. Stop using `text-[10px]`. Minimum operator text **13px**; secondary 12px; timestamps/captions never below 11px.

### Layout doctrine

- Hero: max 540px tall, blobs scale `0.7×` on `/dashboard` so they read as _brand chrome_ not the whole screen.
- KPI strip (4 tiles, 88px tall): replaces both LivePreviewCard _and_ SwissBentoOverview.
- Bento: 12-col grid, 4 rows max. Tiles are 200/280/360px tall (no `clamp(4.5rem,11vw,9rem)` mega-numbers — they're impressive once and tedious twice).
- Triage: single card on `--surface`, breathing 24px padding, base text 14px.

---

## 5. Implementation priority

### 🔥 Critical (ship before submission)

1. **Delete `SwissBentoOverview` from `/dashboard`** (`page.tsx:22`). Move it to `/` or `/about` if you want to keep it. _15 min._
2. **Switch `/dashboard` to dark via `<html className="dark">` or a route-scoped `next-themes` force.** Audit `CrossFormDashboard` chips (`STATUSES`, lines 106-132) — light-mode hex like `bg-blue-100 text-blue-900` will look wrong on dark; flip to the existing `dark:` variants already present in the codebase or to ring-style chips. _60 min._
3. **Replace the 3-stat `LivePreviewCard` with a 4-tile KPI strip** that pulls from one shared query: Submissions (24h delta), Open forms, Bounty TVL, Awaiting decrypt. Reuse `bountyTotalsQuery` + `approvalsByFormQuery` shape from `CrossFormDashboard`. _2 h._
4. **Real submissions-over-time chart** in the hero KPI strip — a 30‑bar mini area chart from actual `SubmissionMade` events (existing `submissionsQuery`). Recharts `<AreaChart>` works; or stick with inline SVG path animation. _2 h._
5. **Bump every `text-[10px]`/`text-[9px]` to `text-xs` (12px) and every section label to `text-sm` (14px)** in `CrossFormDashboard.tsx`. _30 min._

### ⚡ High (visible polish if there's time)

6. **GitHub-style 52w heatmap tile** in bento — same data source. _2 h._
7. **Decrypt-queue tile** promoting m-of-N progress to the top-level grid. _90 min._
8. **Quick-filter pills** above the triage table (Encrypted / 24h / Awaiting / Mine). _60 min._
9. **Top contributors mini-leaderboard** tile. _90 min._
10. **Compress hero to `min(60vh, 540px)`** and shrink WalrusBlob sizes by 30% on `/dashboard` only (pass a `scale` prop). _45 min._
11. **Empty-state illustrated walkthrough** (3 panels). _2 h._

### 💎 Polish (nice-to-haves)

12. Density toggle (Comfortable/Compact).
13. Saved-views localStorage.
14. Realtime ping on the green status dot.
15. Inline submission drawer instead of route bounce.
16. Persistent "● N new this hour" pill linked to the seen-id diff already computed.

Total Critical: ~6 hours of focused work. High: ~10 hours. The Critical path alone fixes the "qua xau qua kho chiu" complaint by removing the three competing aesthetics and giving the page one strong identity.

---

## 6. Risks / open questions

- **Theme commitment.** Does Echo want `/dashboard` dark-only, or will users land here with `system` set to light? Recommend forcing `dark` on `/dashboard` via the layout segment to make the design problem tractable. Decide before step 2.
- **Where does `SwissBentoOverview` live next?** It's a beautiful component (`bg-[#050505]`, noise overlay, RPC ping, package matrix shuffle). It belongs on `/` as the "platform live status" strip, not in the user's admin context. Confirm a home for it before deleting.
- **The "+12.5%" hardcoded delta** in `SwissBentoOverview.tsx:271-273` will get flagged by any judge inspecting the screenshot. If we keep the component anywhere, that string must compute from real submissions diff.
- **m-of-N approval polling.** `approvalsByFormQuery` re-fetches every 8s (line 466). At >20 forms that's noisy. Adding a "Awaiting decrypt" tile increases visibility of that polling — verify there's no rate-limit issue against the fullnode before promoting it.
- **Cloudflare nested-dynamic trap.** Recommendation #4 (Recharts chart inside a client tile) is safe — it's a direct import inside a `"use client"` component. Do _not_ wrap it in `dynamic({ ssr:false })` from a `"use client"` parent.
- **Tailwind 4 token shadowing.** Any new tile that needs `max-w-2xl`-class widths must use `max-w-[680px]` arbitrary values per `globals.css:50-74`.
- **Brand consistency vs route specialization.** Specializing `/dashboard` away from the warm-paper editorial breaks the "every Echo route looks like one product" promise. Mitigation: keep the hero so the route still reads as Echo, and use the same Inter-Tight display face — the only thing that changes below the hero is the _operator_ palette.
- **Tier colors are locked.** Five tier hexes are referenced in `BentoCharts.tsx`, `CrossFormDashboard.tsx`, `SwissBentoOverview.tsx`, and likely more. Don't touch them.
- **Commit attribution.** All work above must land without "Claude"/"Anthropic" in any commit, PR, log card, or in-app copy — three hook layers will block it.
