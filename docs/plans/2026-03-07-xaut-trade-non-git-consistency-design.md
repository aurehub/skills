# xaut-trade Non-Git Consistency Design

Date: 2026-03-07

## Problem

`xaut-trade` currently has mixed path strategies across `SKILL.md`, `README.md`, `references/*`, and setup guidance. Some instructions still assume a git repository root (`git rev-parse --show-toplevel`). This breaks or degrades onboarding when the skill is installed outside a git repo.

## Goals

- Make non-git installations first-class for all `xaut-trade` setup/onboarding/troubleshooting paths.
- Keep git-based developer flows usable by retaining git as an optional fallback.
- Align docs and setup behavior so users get consistent commands regardless of entry point.

## Non-Goals

- No trade execution logic changes.
- No risk policy, slippage, or pair-whitelist changes.
- No cross-repo cleanup outside `skills/xaut-trade/`.

## Scope

Within `skills/xaut-trade/` only:
- `SKILL.md`
- `README.md`
- `references/*.md` (focus: onboarding and any setup/path-related references)
- `scripts/setup.sh` (only where it affects setup path contract or doc/behavior consistency)

## Path Resolution Standard

All setup/path-sensitive instructions use this order:

1. `~/.aurehub/.setup_path` (if file exists and target is valid)
2. Known installation paths:
   - `~/.claude/skills/xaut-trade/scripts/setup.sh`
   - `~/.aurehub/.agents/skills/xaut-trade/scripts/setup.sh`
   - `~/.agents/skills/xaut-trade/scripts/setup.sh`
3. Git repo fallback (`git rev-parse --show-toplevel`) if available
4. Bounded `find` fallback limited to `~/.claude ~/.aurehub ~/.agents`

Derived values:
- `SCRIPTS_DIR = dirname(setup.sh)`
- `SKILL_DIR = dirname(SCRIPTS_DIR)`

## Design Decisions

1. Non-git-first wording in docs
- Primary examples should not start from git-root assumptions.
- Git commands remain documented as fallback, not default.

2. Keep `.setup_path` as canonical anchor
- `setup.sh` already writes `~/.aurehub/.setup_path`; reuse it everywhere.
- Avoid introducing new config files.

3. Bounded fallback only
- Avoid `find ~` patterns that scan all home contents.
- Use bounded directory roots and depth limits.

4. Consistency over brevity
- Prefer one reusable path-resolution snippet pattern across docs.
- Ensure Option A/Option B flows in `SKILL.md` and `references/onboarding.md` produce compatible commands.

## Risks and Mitigations

- Risk: `.setup_path` missing or stale
  - Mitigation: validate file exists; continue through known-path and git fallback.

- Risk: docs become too verbose
  - Mitigation: keep canonical snippet short and reuse wording.

- Risk: setup behavior and docs drift again
  - Mitigation: include residual-pattern checks in verification (`git rev-parse` defaults, unbounded `find ~`).

## Validation Strategy

- Static checks:
  - `bash -n skills/xaut-trade/scripts/setup.sh`
  - pattern scans on `skills/xaut-trade/**/*.md` for forbidden default patterns
- Runtime sanity (no chain writes):
  - verify path-resolution commands produce expected `setup.sh` path in local environment
- Existing script tests unchanged:
  - `cd skills/xaut-trade/scripts && npm test --silent`

## Deliverables

- Updated `xaut-trade` docs and setup guidance following non-git-first standard.
- One implementation plan documenting exact edits, verification commands, and commit breakdown.
