#!/usr/bin/env bash
# Echo → Walrus Sites MAINNET deploy, one command.
#
# Flow:
#   1. Verify sui CLI active env is mainnet
#   2. Build the static SPA from .env.mainnet via build-walrus.sh
#   3. Publish dapp/out/ to Walrus mainnet via site-builder
#
# Usage:
#   pnpm deploy:walrus:mainnet         # 200 epochs (default)
#   EPOCHS=53 pnpm deploy:walrus:mainnet
#   FORCE_NEW=1 pnpm deploy:walrus:mainnet   # ignore any prior site object
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
env-cmd -f .env.mainnet bash scripts/build-walrus.sh

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
site-builder "${PUBLISH_ARGS[@]}"

echo ""
echo "✓ Deployed. Look for the 'New site object ID' in the output above —"
echo "  that's your site anchor. Portal URL is https://<base36(objectId)>.wal.app."
echo "  Bind a SuiNS name with: walgo domain   (or do it manually in the SuiNS dapp)"
