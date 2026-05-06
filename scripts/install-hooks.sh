#!/bin/sh
# One-shot setup: point git at .githooks/ and make the hooks executable.
set -e

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "✗ not inside a git repo. run 'git init' first." >&2
  exit 1
}

cd "$repo_root"

chmod +x .githooks/commit-msg .githooks/pre-push 2>/dev/null || true
git config core.hooksPath .githooks

echo "✓ git hooks wired:"
echo "  core.hooksPath = $(git config core.hooksPath)"
echo ""
echo "  commit-msg → blocks Claude/Anthropic attribution"
echo "  pre-push   → warns if dapp/public/logs/index.html not updated"
