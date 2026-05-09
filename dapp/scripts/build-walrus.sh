#!/usr/bin/env bash
# Build the dapp as a fully static SPA suitable for Walrus Sites.
#
# Why this script (and not just `next build`)?
#   - Next.js's `output: "export"` errors out if /api routes exist anywhere
#     under src/app, even if they're never reached. We physically move the
#     api dir out of the way for the duration of the build, then put it
#     back regardless of whether the build succeeded.
#   - The walrus-deployed SPA still calls the /api/* endpoints, but those
#     live on the Cloudflare Pages origin — set NEXT_PUBLIC_API_BASE_URL
#     before invoking this script (e.g. https://echo-20u.pages.dev).
#
# Usage:
#   NEXT_PUBLIC_API_BASE_URL=https://echo-20u.pages.dev pnpm build:walrus
#
# Output: dapp/out/  (consumed by `site-builder publish`)
set -euo pipefail

cd "$(dirname "$0")/.."

API_DIR="src/app/api"
# Move the api dir completely OUT of src/app/ — Next's app router scans
# recursively even into folders prefixed with "." so renaming in place
# doesn't exclude the routes from the build.
PARKED_DIR=".api-parked"
MIDDLEWARE="src/middleware.ts"
PARKED_MIDDLEWARE=".middleware-parked.ts"
# /s/[name] does a server-side redirect — incompatible with static export.
# Park it for the walrus build; users can still reach forms directly via
# /forms/[id]. SuiNS shareable links will need a client-side resolver in
# a future iteration.
SLINKS_DIR="src/app/s"
PARKED_SLINKS=".s-parked"

restore() {
  [ -d "$PARKED_DIR" ] && mv "$PARKED_DIR" "$API_DIR"
  [ -f "$PARKED_MIDDLEWARE" ] && mv "$PARKED_MIDDLEWARE" "$MIDDLEWARE"
  [ -d "$PARKED_SLINKS" ] && mv "$PARKED_SLINKS" "$SLINKS_DIR"
}
trap restore EXIT

if [ -d "$API_DIR" ]; then
  mv "$API_DIR" "$PARKED_DIR"
fi
# middleware.ts only makes sense paired with /api routes; static export
# doesn't run middleware anyway, but Next will warn if it's left in place.
if [ -f "$MIDDLEWARE" ]; then
  mv "$MIDDLEWARE" "$PARKED_MIDDLEWARE"
fi
if [ -d "$SLINKS_DIR" ]; then
  mv "$SLINKS_DIR" "$PARKED_SLINKS"
fi

# Static export can't use edge runtime — strip `export const runtime = "edge"`
# from every page that has it. We back up originals so the trap can restore.
# IMPORTANT: paths contain `[id]` brackets which bash's word splitting
# treats as glob character classes — `for page in $EDGE_PAGES` collapses
# every path into one iteration. Use `while read` with a NUL-safe pipeline
# instead so each path is its own iteration.
EDGE_BACKUPS=()
restore_edge() {
  # Guard against empty array under `set -u`.
  if [ ${#EDGE_BACKUPS[@]} -eq 0 ]; then return; fi
  for f in "${EDGE_BACKUPS[@]}"; do
    [ -f "$f" ] && mv "$f" "${f%.walrus-bak}"
  done
}
trap 'restore; restore_edge' EXIT

echo "stripping runtime=edge from pages…"
# `find … -print0` + `read -d ''` is portable across BSD (macOS) and GNU
# tools. Earlier we tried `grep -lZ` which is GNU-only — BSD grep silently
# emits newline-separated output and the read loop never iterates.
while IFS= read -r -d '' page; do
  if grep -q 'runtime = "edge"' "$page" 2>/dev/null; then
    echo "  - $page"
    cp "$page" "${page}.walrus-bak"
    EDGE_BACKUPS+=("${page}.walrus-bak")
    if [ "$(uname)" = "Darwin" ]; then
      sed -i '' 's|^export const runtime = "edge";|// export const runtime = "edge"; // disabled for walrus build|' "$page"
    else
      sed -i 's|^export const runtime = "edge";|// export const runtime = "edge"; // disabled for walrus build|' "$page"
    fi
  fi
done < <(find src/app -type f \( -name "*.tsx" -o -name "*.ts" \) -print0 2>/dev/null)

# Inject generateStaticParams + dynamicParams=false stubs into each
# dynamic route page. Required by Next 15 + output:"export" — without a
# generateStaticParams export the build aborts on dynamic [param]
# segments. We can't put it in the source file because Next 15 refuses
# `runtime = "edge"` AND `generateStaticParams` together (and CF Pages
# needs the edge runtime). Backup files share the .walrus-bak suffix so
# the existing restore_edge trap reverts them too.
echo "injecting generateStaticParams stubs into dynamic routes…"
DYNAMIC_PAGES=(
  "src/app/forms/[id]/page.tsx"
  "src/app/forms/[id]/admin/page.tsx"
)
for page in "${DYNAMIC_PAGES[@]}"; do
  [ -f "$page" ] || continue
  # If we haven't backed it up via the runtime-strip step, do so now.
  if [ ! -f "${page}.walrus-bak" ]; then
    cp "$page" "${page}.walrus-bak"
    EDGE_BACKUPS+=("${page}.walrus-bak")
  fi
  # Append the stub. Next 15 requires ≥1 entry under output:"export";
  # /forms/_ becomes the SPA fallback that hydrates client-side and
  # reads window.location.pathname to resolve the actual form id.
  cat >> "$page" <<'EOF'

// ---- INJECTED BY scripts/build-walrus.sh — DO NOT COMMIT ----
export function generateStaticParams(): { id: string }[] {
  return [{ id: "_" }];
}
export const dynamicParams = false;
EOF
  echo "  - $page"
done

if [ -z "${NEXT_PUBLIC_API_BASE_URL:-}" ]; then
  echo "warning: NEXT_PUBLIC_API_BASE_URL not set — the SPA will try to" >&2
  echo "         hit /api/* on its own origin (which won't exist). Pass" >&2
  echo "         the Cloudflare Pages origin you want to delegate to." >&2
fi

WALRUS_BUILD=1 pnpm build

# next.config.ts sets distDir=".next-walrus" so the build cache + static
# export both land there (avoids clobbering pnpm dev's .next/). Move the
# static-export tree to out/ so site-builder consumes a canonical path.
rm -rf out
mkdir -p out
# Copy everything from .next-walrus EXCEPT the build-cache subdirs
# (server/, cache/, types/, trace) — only the static assets are needed.
for entry in .next-walrus/*; do
  name=$(basename "$entry")
  case "$name" in
    server|cache|types|trace|build-manifest.json|prerender-manifest.json|routes-manifest.json|app-build-manifest.json|app-path-routes-manifest.json|export-detail.json|export-marker.json|images-manifest.json|next-minimal-server.js.nft.json|next-server.js.nft.json|package.json|react-loadable-manifest.json|required-server-files.json) ;;
    *) cp -R "$entry" "out/" ;;
  esac
done

echo ""
echo "✓ static SPA in dapp/out/"
echo "  $(find out -type f | wc -l | tr -d ' ') files, $(du -sh out | cut -f1) total"
echo "  next: site-builder publish ./out --epochs <N>"
