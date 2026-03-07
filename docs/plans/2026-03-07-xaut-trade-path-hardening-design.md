# xaut-trade Path Hardening Design

Date: 2026-03-07

## Problem

Current `xaut-trade` setup and onboarding flows still have a few brittle assumptions:
- some commands fail unclearly when setup path cannot be resolved
- some manual commands assume repository-relative paths
- a git fallback branch in onboarding does not validate path existence before execution
- one setup error message references an obsolete wallet-import flow
- setup temp files use fixed names under `/tmp`

These do not break trade logic, but degrade onboarding reliability and operator trust.

## Goals

- Preserve non-git-first strategy while keeping git as optional fallback.
- Remove remaining repo-relative assumptions from user-facing manual commands.
- Ensure fallback branches validate path existence before use.
- Align setup error messages with current wallet creation flow.
- Improve temp-file safety via unique temp files.

## Non-Goals

- No change to trade execution/risk logic.
- No change to API behavior or chain integrations.
- No changes outside `skills/xaut-trade/*`.

## Scope

- `skills/xaut-trade/README.md`
- `skills/xaut-trade/references/onboarding.md`
- `skills/xaut-trade/scripts/setup.sh`

## Design Decisions

1. Setup command guard in README
- If resolved setup path is empty, do not run `bash ""`.
- Print actionable next step (bounded search command).

2. Manual commands become install-location-agnostic
- Replace repo-relative `cp skills/...` and `cd skills/...` examples with resolved `SKILL_DIR` / `SCRIPTS_DIR` snippets using:
  - `~/.aurehub/.setup_path`
  - known install paths
  - git fallback
  - bounded find fallback

3. Onboarding git fallback hardening
- Guard `GIT_ROOT` fallback with existence checks before invoking `bash`.
- If invalid, continue to bounded find fallback.

4. Setup message alignment
- Replace obsolete `cast wallet import` mention with current `cast wallet new ... --password-file` language.

5. Temp file safety
- Replace fixed `/tmp/xaut_cast_err` and `/tmp/.env.tmp` with `mktemp` files.
- Clean up temp files after use.

## Validation

- `bash -n skills/xaut-trade/scripts/setup.sh`
- `cd skills/xaut-trade/scripts && npm test --silent`
- Targeted grep checks for removed brittle patterns:
  - `bash "$_s"` unguarded execution
  - repo-relative manual commands in README
  - obsolete `cast wallet import` wording
  - fixed `/tmp` filenames in setup script

