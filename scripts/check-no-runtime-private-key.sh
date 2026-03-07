#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT_DIR"

echo "[check] scanning for forbidden runtime private-key signing patterns..."

patterns=(
  '--private-key'
  'cast wallet address.*PRIVATE_KEY'
  'new ethers\.Wallet\(privateKey\)'
  'private key fallback mode'
)

failed=0
OUT_FILE=$(mktemp)
trap 'rm -f "$OUT_FILE"' EXIT

for p in "${patterns[@]}"; do
  if rg -n -S "$p" skills >"$OUT_FILE" 2>/dev/null; then
    echo
    echo "[fail] matched pattern: $p"
    cat "$OUT_FILE"
    failed=1
  fi
done

if [[ $failed -eq 1 ]]; then
  echo
  echo "Policy violation: runtime PRIVATE_KEY signing references found."
  exit 1
fi

echo "[ok] no forbidden runtime private-key signing patterns found."
