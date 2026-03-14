#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$REPO_ROOT"
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit

echo "[ok] git hooks enabled: core.hooksPath=.githooks"
echo "[hint] pre-commit runs: check-no-runtime-private-key + check-skill-version"
