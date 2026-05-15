#!/usr/bin/env bash
# Echo → Walrus Sites MAINNET deploy, one command.
#
# Flow:
#   1. Verify sui CLI active env is mainnet
#   2. Build the static SPA from .env.mainnet via build-walrus.sh
#   3. Publish dapp/out/ to Walrus mainnet via site-builder
#   4. Pre-warm Walrus aggregator caches for the new site (best-effort)
#
# Aggregator pre-warm (step 4):
#   After site-builder reports a "New site object ID" the site's blobs are on
#   Walrus storage nodes but each aggregator's local cache is cold. The
#   `wal.app` portal load-balances across a pool of ~10 aggregators, so the
#   first user to hit a given aggregator typically gets a 503 while it
#   back-fills. Pre-warm fans out a GET per (aggregator × top-N file) so the
#   pool is hot before anyone clicks the link. The step is best-effort —
#   any failure logs a warning and the script still exits 0. Set
#   `SKIP_PREWARM=1` to skip entirely (useful for tight dev iteration).
#
# Usage:
#   pnpm deploy:walrus:mainnet                       # 200 epochs (default)
#   EPOCHS=53 pnpm deploy:walrus:mainnet
#   FORCE_NEW=1 pnpm deploy:walrus:mainnet           # ignore any prior site object
#   EPOCHS=53 SKIP_PREWARM=1 pnpm deploy:walrus:mainnet
#   PREWARM_MAX_FILES=80 pnpm deploy:walrus:mainnet  # tune the warm budget
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

# 4. Pre-warm aggregator caches for the new site. Best-effort.
if [ "${SKIP_PREWARM:-0}" = "1" ] || [ "${DRY_RUN:-0}" = "1" ]; then
  if [ "${DRY_RUN:-0}" = "1" ]; then
    echo "→ pre-warm skipped (DRY_RUN=1)"
  else
    echo "→ pre-warm skipped (SKIP_PREWARM=1)"
  fi
  exit 0
fi

prewarm() {
  # Extract base36 hostname. site-builder prints lines like:
  #   "Browse the resulting site at: https://<base36>.wal.app"
  #   "http://<base36>.localhost:3000"
  # Pull the first base36-looking subdomain we see.
  local base36
  base36="$(grep -Eoh '[a-z0-9]{40,}\.(wal\.app|localhost(:[0-9]+)?)' "$PUBLISH_LOG" \
    | sed -E 's/\.(wal\.app|localhost(:[0-9]+)?)$//' \
    | head -n 1 || true)"

  if [ -z "$base36" ]; then
    echo "⚠ pre-warm: could not extract base36 hostname from site-builder output — skipping" >&2
    return 0
  fi
  echo "→ pre-warm base36: $base36"

  # Aggregator portal list. Prefer aggregator URLs defined in
  # ~/.config/walrus/client_config.yaml under the mainnet context
  # (keys: aggregators / aggregator_urls / public_aggregator_urls).
  local cfg="${WALRUS_CLIENT_CONFIG:-$HOME/.config/walrus/client_config.yaml}"
  local -a aggregators=()
  if [ -f "$cfg" ]; then
    # Naive YAML scrape — pulls any `https://…` URL that lives under a
    # mainnet aggregator-looking key. Safe even if no such key exists.
    while IFS= read -r url; do
      [ -n "$url" ] && aggregators+=("$url")
    done < <(
      awk '
        function indent(s,   t) { match(s, /^[[:space:]]*/); return RLENGTH }
        /^[[:space:]]*mainnet:/  { ctx=1; ctx_indent=indent($0); agg=0; next }
        /^[[:space:]]*testnet:/  { ctx=0; agg=0; next }
        ctx && /^[[:space:]]*[a-zA-Z_]+:/ {
          key=$0; sub(/:.*$/, "", key); sub(/^[[:space:]]+/, "", key)
          if (key ~ /aggregator/) { agg=1; agg_indent=indent($0); next }
          else if (agg && indent($0) <= agg_indent) { agg=0 }
        }
        ctx && agg && /^[[:space:]]*-[[:space:]]*"?https?:\/\// {
          line=$0
          sub(/^[[:space:]]*-[[:space:]]*"?/, "", line)
          sub(/"?[[:space:]]*$/, "", line)
          print line
        }
        ctx && /^[^[:space:]-]/   { ctx=0; agg=0 }
      ' "$cfg" 2>/dev/null
    )
  fi

  # Fallback: well-known mainnet wal.app-style portals. These each terminate
  # at a different aggregator pool, so hitting <base36>.<portal> primes that
  # pool's cache for the new site's blobs.
  if [ "${#aggregators[@]}" -eq 0 ]; then
    aggregators=(
      "https://wal.app"
      "https://blob.store"
      "https://agg.walrus.eosusa.io"
      "https://aggregator.walrus.mirai.cloud"
      "https://aggregator.mainnet.walrus.mirai.cloud"
      "https://walrus-mainnet-aggregator.nodes.guru"
      "https://walrus-mainnet-aggregator.staketab.org"
      "https://walrus-mainnet-aggregator.everstake.one"
      "https://walrus-mainnet-aggregator.chainode.tech"
      "https://walrus-mainnet-aggregator.starduststaking.com"
    )
  fi

  # Pick the top-N files to warm. Strategy:
  #   - Always include HTML pages (every route the user can land on).
  #   - Then the largest JS chunks (initial-paint critical).
  #   - Skip fonts and media (browser cache + lazy loaded).
  local file_list
  file_list="$(mktemp -t echo-prewarm-files.XXXXXX)"
  # shellcheck disable=SC2064
  trap "rm -f '$PUBLISH_LOG' '$file_list'" EXIT

  # HTML pages first
  ( cd "$OUT_DIR" && find . -type f -name "*.html" | sed 's|^\./||' ) > "$file_list"
  # Then biggest JS chunks (du -k is portable; sort numeric desc)
  ( cd "$OUT_DIR" && find . -type f -name "*.js" -exec du -k {} + \
      | sort -rn \
      | awk '{ $1=""; sub(/^ /, ""); print }' \
      | sed 's|^\./||' ) >> "$file_list"

  # Dedup + cap
  local capped
  capped="$(mktemp -t echo-prewarm-capped.XXXXXX)"
  # shellcheck disable=SC2064
  trap "rm -f '$PUBLISH_LOG' '$file_list' '$capped'" EXIT
  awk '!seen[$0]++' "$file_list" | head -n "$PREWARM_MAX_FILES" > "$capped"

  local file_count agg_count total_reqs
  file_count="$(wc -l < "$capped" | tr -d ' ')"
  agg_count="${#aggregators[@]}"
  total_reqs=$((file_count * agg_count))
  if [ "$file_count" -eq 0 ] || [ "$agg_count" -eq 0 ]; then
    echo "⚠ pre-warm: nothing to warm (files=$file_count, aggregators=$agg_count) — skipping" >&2
    return 0
  fi

  echo "→ pre-warm: $file_count files × $agg_count aggregators = $total_reqs requests (parallel=$PREWARM_PARALLEL, timeout=${PREWARM_TIMEOUT}s)"

  # Results file: "<agg>\t<status>" per line.
  local results
  results="$(mktemp -t echo-prewarm-results.XXXXXX)"
  # shellcheck disable=SC2064
  trap "rm -f '$PUBLISH_LOG' '$file_list' '$capped' '$results'" EXIT

  # Build the request list (agg<TAB>url) then xargs -P for parallelism.
  local reqs
  reqs="$(mktemp -t echo-prewarm-reqs.XXXXXX)"
  # shellcheck disable=SC2064
  trap "rm -f '$PUBLISH_LOG' '$file_list' '$capped' '$results' '$reqs'" EXIT

  while IFS= read -r path; do
    [ -z "$path" ] && continue
    # Encode spaces — Next.js output rarely has them but be safe.
    local enc_path
    enc_path="${path// /%20}"
    for agg in "${aggregators[@]}"; do
      # Derive host portion of the portal so we can produce <base36>.<host>.
      local proto host portal_host
      proto="${agg%%://*}"
      host="${agg#*://}"
      host="${host%%/*}"
      portal_host="${base36}.${host}"
      printf '%s\t%s://%s/%s\n' "$host" "$proto" "$portal_host" "$enc_path" >> "$reqs"
    done
  done < "$capped"

  # Fire requests. Use a helper inline; -P for parallelism. We swallow errors
  # so a slow/broken aggregator can't kill the whole batch.
  : > "$results"
  # shellcheck disable=SC2016
  xargs -P "$PREWARM_PARALLEL" -I{} -n 1 bash -c '
    line="$1"
    host="${line%%	*}"
    url="${line#*	}"
    code="$(curl -k -s -o /dev/null \
      --connect-timeout 5 --max-time '"$PREWARM_TIMEOUT"' \
      -w "%{http_code}" "$url" || echo "000")"
    printf "%s\t%s\n" "$host" "$code"
  ' _ {} < "$reqs" >> "$results" 2>/dev/null || true

  # Summary: total fired, per-aggregator status histogram. Portable: avoids
  # gawk-only asorti by piping through sort + uniq in shell.
  local fired
  fired="$(wc -l < "$results" | tr -d ' ')"
  echo "→ pre-warm summary: $fired/$total_reqs requests completed"

  # For each aggregator host, print "    <host>  (n=N)  <code>=K <code>=K …"
  local hosts_uniq
  hosts_uniq="$(awk -F'\t' '{ print $1 }' "$results" | sort -u)"
  while IFS= read -r host; do
    [ -z "$host" ] && continue
    local n histogram
    n="$(awk -F'\t' -v h="$host" '$1 == h { c++ } END { print c+0 }' "$results")"
    histogram="$(awk -F'\t' -v h="$host" '$1 == h { print $2 }' "$results" \
      | sort | uniq -c \
      | awk '{ printf "%s=%d ", $2, $1 }')"
    echo "    $host  (n=$n)  $histogram"
  done <<< "$hosts_uniq"
}

# Best-effort: never fail the deploy because of pre-warm.
if ! prewarm; then
  echo "⚠ pre-warm encountered an error — site is deployed, first visitor may hit a cold-cache 503." >&2
fi

exit 0
