# xaut-trade Path Assumption Removal Design

Date: 2026-03-07

## Problem

`xaut-trade` still contains environment-specific assumptions:
- hardcoded agent install paths (`~/.claude`, `~/.agents`, `~/.aurehub/.agents`)
- path resolution snippets duplicated across files
- one fallback executes `bash "$(find ... | head -1)"` without empty-path guard
- `limit-order.js` temp file naming is not fully robust

## Goals

- Remove product-specific install-path assumptions from user-facing instructions.
- Standardize path resolution strategy across `SKILL.md`, `README.md`, and `references/onboarding.md`.
- Ensure every fallback checks resolved path before execution.
- Harden temp-file handling in `limit-order.js`.

## Non-Goals

- No trade logic changes.
- No changes outside `skills/xaut-trade`.

## Design

Unified setup path strategy:
1. `~/.aurehub/.setup_path` (if present and valid)
2. git fallback (`git rev-parse --show-toplevel`) when valid
3. bounded generic search under `$HOME`:
   `find "$HOME" -maxdepth 6 -type f -path "*/xaut-trade/scripts/setup.sh" | head -1`

Derived paths:
- `SCRIPTS_DIR = dirname(SETUP_PATH)`
- `SKILL_DIR = dirname(SCRIPTS_DIR)`

Guardrail:
- Never execute `bash "$SETUP_PATH"` unless path is non-empty and file exists.

Temp file hardening in `limit-order.js`:
- Replace timestamp-only `/tmp/...` path with `fs.mkdtempSync(os.tmpdir())` + cleanup.

## Files

- `skills/xaut-trade/SKILL.md`
- `skills/xaut-trade/README.md`
- `skills/xaut-trade/references/onboarding.md`
- `skills/xaut-trade/scripts/limit-order.js`

## Validation

- `bash -n skills/xaut-trade/scripts/setup.sh`
- `cd skills/xaut-trade/scripts && npm test --silent`
- pattern scan for removed assumptions in target docs

