#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT_DIR"

echo "[check] scanning for forbidden runtime private-key signing patterns..."

patterns=(
  '--private-key'
  'cast wallet address "\$PRIVATE_KEY"'
  'new ethers\.Wallet\(privateKey\)'
  'private key fallback mode'
)

failed=0

for p in "${patterns[@]}"; do
  if rg -n -S "$p" skills >/tmp/private_key_check.out 2>/dev/null; then
    echo
    echo "[fail] matched pattern: $p"
    cat /tmp/private_key_check.out
    failed=1
  fi
done

rm -f /tmp/private_key_check.out

if [[ $failed -eq 1 ]]; then
  echo
  echo "Policy violation: runtime PRIVATE_KEY signing references found."
  exit 1
fi

echo "[ok] no forbidden runtime private-key signing patterns found."
