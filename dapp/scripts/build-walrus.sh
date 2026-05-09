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

restore() {
  [ -d "$PARKED_DIR" ] && mv "$PARKED_DIR" "$API_DIR"
  [ -f "$PARKED_MIDDLEWARE" ] && mv "$PARKED_MIDDLEWARE" "$MIDDLEWARE"
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

# Static export can't use edge runtime — strip `export const runtime = "edge"`
# from every page that has it. We back up originals so the trap can restore.
EDGE_PAGES=$(grep -rln 'runtime = "edge"' src/app/ --include="*.tsx" --include="*.ts" 2>/dev/null || true)
EDGE_BACKUPS=""
restore_edge() {
  for f in $EDGE_BACKUPS; do
    [ -f "$f" ] && mv "$f" "${f%.walrus-bak}"
  done
}
# Augment the trap to also restore edge-runtime declarations.
trap 'restore; restore_edge' EXIT
for page in $EDGE_PAGES; do
  cp "$page" "${page}.walrus-bak"
  EDGE_BACKUPS="$EDGE_BACKUPS ${page}.walrus-bak"
  # Comment out the runtime export line so the page goes Node/static.
  # Use sed -i '' on macOS, sed -i on Linux (probe via uname).
  if [ "$(uname)" = "Darwin" ]; then
    sed -i '' 's|^export const runtime = "edge";|// export const runtime = "edge"; // disabled for walrus build|' "$page"
  else
    sed -i 's|^export const runtime = "edge";|// export const runtime = "edge"; // disabled for walrus build|' "$page"
  fi
done

if [ -z "${NEXT_PUBLIC_API_BASE_URL:-}" ]; then
  echo "warning: NEXT_PUBLIC_API_BASE_URL not set — the SPA will try to" >&2
  echo "         hit /api/* on its own origin (which won't exist). Pass" >&2
  echo "         the Cloudflare Pages origin you want to delegate to." >&2
fi

WALRUS_BUILD=1 pnpm build
echo ""
echo "✓ static SPA in dapp/out/"
echo "  next: site-builder publish ./out --epochs <N>"
