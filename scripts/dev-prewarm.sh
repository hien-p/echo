#!/usr/bin/env bash
# Pre-warm Turbopack/Webpack route caches so first-click navigation in
# the browser is instant instead of waiting 5-30s for cold compile.
#
# Usage:  scripts/dev-prewarm.sh [base-url]
# Default base-url: http://localhost:3333
#
# Run AFTER `pnpm dev` is up and serving (curl `/` succeeds).

set -e
base="${1:-http://localhost:3333}"

routes=(
  /
  /dashboard
  /forms
  /forms/new
  /insights
  /reputation
  /docs
  /app
)

echo "pre-warming routes against $base ..."
for route in "${routes[@]}"; do
  (
    code_time=$(curl -s -o /dev/null -w "%{http_code} %{time_total}s" "$base$route" || echo "ERR -")
    printf "  %-20s %s\n" "$route" "$code_time"
  ) &
done
wait
echo "done."
