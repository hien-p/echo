#!/usr/bin/env bash
# Echo → Walrus Sites MAINNET deploy, one command.
#
# Flow:
#   1. Verify sui CLI active env is mainnet
#   2. Build the static SPA from .env.mainnet via build-walrus.sh
#   3. Publish dapp/out/ to Walrus mainnet via site-builder
#   4. Pre-warm Walrus aggregator caches for the new site (best-effort)
#
# Pre-warm (step 4):
#   After site-builder publishes, the new blobs are on Walrus storage
#   nodes but the aggregator pool behind the wal.app portal is cold —
#   the first ~5 min of visitors can hit a 503 / ChunkLoadError. This
#   step GETs every HTML route + the shared JS/CSS assets on the REAL
#   bound domain (echo-forms.wal.app), sequentially with a small gap,
#   two passes. That drives the portal + aggregators to backfill from
#   storage before users arrive. Light + sequential + same domain a
#   user hits → no rate-limit risk (the old 50-burst-at-fake-hosts
#   version is gone — see the step-4 comment block below). Best-effort;
#   any failure just logs a warning and the deploy still exits 0.
#
# Usage:
#   pnpm deploy:walrus:mainnet                       # 200 epochs (default)
#   EPOCHS=53 pnpm deploy:walrus:mainnet
#   FORCE_NEW=1 pnpm deploy:walrus:mainnet           # ignore any prior site object
#   EPOCHS=53 SKIP_PREWARM=1 pnpm deploy:walrus:mainnet
#   PREWARM_DOMAIN=foo.wal.app pnpm deploy:walrus:mainnet  # warm a different bound name
#   PREWARM_DELAY=0.2 pnpm deploy:walrus:mainnet     # tune inter-request gap
#
# Prereqs (one-time, see scripts/deploy-mainnet.md):
#   - walrus + site-builder CLIs installed via suiup
#   - sui client switch --env mainnet
#   - .env.mainnet filled in (package id, Seal servers, Enoki keys)
#   - mainnet wallet funded with SUI + WAL
set -euo pipefail

cd "$(dirname "$0")/.."

EPOCHS="${EPOCHS:-200}"
CONTEXT="mainnet"
OUT_DIR="out"
PREWARM_MAX_FILES="${PREWARM_MAX_FILES:-50}"
PREWARM_TIMEOUT="${PREWARM_TIMEOUT:-12}"
PREWARM_PARALLEL="${PREWARM_PARALLEL:-8}"

# 1. Sanity-check sui env
ACTIVE_ENV="$(sui client active-env 2>/dev/null | tail -1)"
if [ "$ACTIVE_ENV" != "mainnet" ]; then
  echo "✗ sui client active-env is '$ACTIVE_ENV', expected 'mainnet'." >&2
  echo "  run: sui client switch --env mainnet" >&2
  exit 1
fi
ACTIVE_ADDR="$(sui client active-address 2>/dev/null | tail -1)"
echo "→ sui mainnet · $ACTIVE_ADDR"

# 2. Build the static SPA against .env.mainnet
echo "→ building static SPA (env: .env.mainnet)…"
pnpm run build:walrus:mainnet

if [ ! -d "$OUT_DIR" ]; then
  echo "✗ build produced no $OUT_DIR/ dir" >&2
  exit 1
fi

# 3. Publish to Walrus mainnet. site-builder reads
#    ~/.config/walrus/sites-config.yaml; the `mainnet` context there
#    already has package + staking-object + walrus_package wired.
PUBLISH_ARGS=(--context "$CONTEXT" publish "$OUT_DIR" --epochs "$EPOCHS")
if [ "${DRY_RUN:-0}" = "1" ]; then
  PUBLISH_ARGS+=(--dry-run)
  echo "→ DRY-RUN: site-builder ${PUBLISH_ARGS[*]}"
else
  echo "→ site-builder ${PUBLISH_ARGS[*]}"
fi

# Capture site-builder output so we can extract the base36 hostname for
# pre-warming, while still streaming progress to the user.
PUBLISH_LOG="$(mktemp -t echo-site-builder.XXXXXX)"
trap 'rm -f "$PUBLISH_LOG"' EXIT

set +e
site-builder "${PUBLISH_ARGS[@]}" 2>&1 | tee "$PUBLISH_LOG"
SB_STATUS=${PIPESTATUS[0]}
set -e
if [ "$SB_STATUS" -ne 0 ]; then
  echo "✗ site-builder exited $SB_STATUS" >&2
  exit "$SB_STATUS"
fi

echo ""
echo "✓ Deployed. Look for the 'New site object ID' in the output above —"
echo "  that's your site anchor. Portal URL is https://<base36(objectId)>.wal.app."
echo "  Bind a SuiNS name with: walgo domain   (or do it manually in the SuiNS dapp)"


# 4. Pre-warm the live site so the first real visitor after a deploy
#    doesn't hit the cold-aggregator window.
#
# History: the original implementation fanned 50 parallel requests at
# <base36>.<hardcoded-aggregator> hostnames. That was wrong — those
# hosts aren't Walrus Sites portals (curl 000), and the 50-burst at
# wal.app tripped its rate limiter (HTTP 520), which can *degrade* the
# site for a concurrent real user.
#
# Correct approach (this version): hit the real bound domain
# (PREWARM_DOMAIN, default echo-forms.wal.app) for every HTML route
# plus the JS/CSS assets each route references, SEQUENTIALLY with a
# small inter-request delay. That drives the wal.app portal — and the
# aggregator pool behind it — to backfill the new blobs from storage
# nodes before users arrive. Light, sequential, same domain a user
# would hit: no rate-limit risk. Two passes (warm, then verify).
#
# Safe enough to run by default. Opt out with SKIP_PREWARM=1.
PREWARM_DOMAIN="${PREWARM_DOMAIN:-echo-forms.wal.app}"
PREWARM_DELAY="${PREWARM_DELAY:-0.4}"

if [ "${SKIP_PREWARM:-0}" = "1" ] || [ "${DRY_RUN:-0}" = "1" ]; then
  if [ "${DRY_RUN:-0}" = "1" ]; then
    echo "→ pre-warm skipped (DRY_RUN=1)"
  else
    echo "→ pre-warm skipped (SKIP_PREWARM=1)"
  fi
  exit 0
fi

prewarm() {
  local base="https://${PREWARM_DOMAIN}"

  # Route list: every HTML page emitted into out/ becomes a URL path.
  #   out/index.html              -> /
  #   out/dashboard/index.html    -> /dashboard/
  #   out/forms/_/index.html      -> /forms/_/  (SPA fallback)
  local -a routes=()
  while IFS= read -r f; do
    local rel="${f#"$OUT_DIR"/}"
    rel="${rel%index.html}"
    routes+=("/${rel}")
  done < <(find "$OUT_DIR" -type f -name "index.html" | sort)

  if [ "${#routes[@]}" -eq 0 ]; then
    echo "⚠ pre-warm: no HTML routes found in $OUT_DIR — skipping" >&2
    return 0
  fi

  # Collect the asset URLs referenced by the homepage + dashboard (the
  # two heaviest first-paint surfaces). One representative HTML is
  # enough — Next shares the framework/main chunks across routes.
  local assets_file
  assets_file="$(mktemp -t echo-prewarm-assets.XXXXXX)"
  # shellcheck disable=SC2064
  trap "rm -f '$PUBLISH_LOG' '$assets_file'" EXIT
  for r in "/" "/dashboard/"; do
    curl -s --max-time 15 "${base}${r}" 2>/dev/null \
      | grep -oE '/_next/static/(chunks|css)/[a-zA-Z0-9_./-]+\.(js|css)'
  done | sort -u > "$assets_file"

  local n_routes n_assets
  n_routes="${#routes[@]}"
  n_assets="$(wc -l < "$assets_file" | tr -d ' ')"
  echo "→ pre-warm: $n_routes routes + $n_assets shared assets on $PREWARM_DOMAIN (sequential, ${PREWARM_DELAY}s gap, 2 passes)"

  local pass code ok total
  for pass in 1 2; do
    ok=0
    total=0
    # HTML routes
    for r in "${routes[@]}"; do
      code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "${base}${r}" 2>/dev/null || echo 000)"
      total=$((total + 1))
      [ "$code" = "200" ] && ok=$((ok + 1))
      sleep "$PREWARM_DELAY"
    done
    # Shared assets
    while IFS= read -r a; do
      [ -z "$a" ] && continue
      code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "${base}${a}" 2>/dev/null || echo 000)"
      total=$((total + 1))
      [ "$code" = "200" ] && ok=$((ok + 1))
      sleep "$PREWARM_DELAY"
    done < "$assets_file"
    echo "    pass $pass: $ok/$total returned 200"
  done
}

# Best-effort: never fail the deploy because of pre-warm.
if ! prewarm; then
  echo "⚠ pre-warm encountered an error — site is deployed, first visitor may hit a cold-cache 503." >&2
fi

exit 0
