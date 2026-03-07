# XAUT Trade Confirmation and Rankings Prompt Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement USD-based confirmation thresholds, configurable approve confirmations, and one-time post-trade rankings prompt while preserving compatibility.

**Architecture:** This change is spec-driven (Skill instructions + docs). Runtime behavior is governed by `SKILL.md` and `references/*`; config defaults are described in `config.example.yaml` and `README.md`.

**Tech Stack:** Markdown instruction files, YAML config/docs, Skill tests YAML.

---

### Task 1: Update config defaults and core skill policy

**Files:**
- Modify: `skills/xaut-trade/config.example.yaml`
- Modify: `skills/xaut-trade/SKILL.md`

**Step 1: Add new risk config defaults in config example**
- Add `confirm_trade_usd: 10`
- Add `approve_confirmation_mode: "first_only"`
- Add `approve_force_confirm_multiple: 10`

**Step 2: Update Interaction/Safety sections in SKILL.md**
- Replace fixed “confirm before every write” with threshold-based rules.
- Document approve mode + force-confirm override.

**Step 3: Update Post-Trade Registration section in SKILL.md**
- Add one-time post-success rankings prompt when opt-in is false.
- Add marker behavior in `~/.aurehub/.rankings_prompted`.

**Step 4: Verify changed fields are consistently named**
Run: `rg -n "confirm_trade_usd|approve_confirmation_mode|approve_force_confirm_multiple|rankings_prompted" skills/xaut-trade -S`
Expected: fields appear in config + docs with same names.

### Task 2: Update execution references for buy/sell and quote gates

**Files:**
- Modify: `skills/xaut-trade/references/quote.md`
- Modify: `skills/xaut-trade/references/buy.md`
- Modify: `skills/xaut-trade/references/sell.md`

**Step 1: Rewrite confirmation gate in quote.md**
- Add single/double/optional confirmation tiers by USD notional.
- Keep slippage-triggered double-confirmation.

**Step 2: Add approve confirmation policy in buy/sell refs**
- Describe when approve confirmation is needed under each mode.
- Add force-confirm safety override for oversize approvals.

**Step 3: Keep chain write confirmation wording consistent**
Run: `rg -n "confirm approve|confirm swap|single confirmation|double confirmation|approve_confirmation_mode" skills/xaut-trade/references -S`
Expected: no conflicting old guidance.

### Task 3: Update README and behavior tests

**Files:**
- Modify: `skills/xaut-trade/README.md`
- Modify: `skills/xaut-trade/SKILL.tests.yaml`

**Step 1: Update README flow/risk/config sections**
- Reflect new thresholds and approve mode.
- Keep `RANKINGS_OPT_IN` default false; add first-success prompt behavior.

**Step 2: Update/add behavior tests**
- Add checks for `confirm_trade_usd` tiering language.
- Add checks for first-only approve confirmation and rankings one-time prompt language.

**Step 3: Run quick validation**
Run: `npm test`
Expected: pass.

### Task 4: Final verification

**Files:**
- Verify only changed intended files.

**Step 1: Search consistency checks**
Run: `rg -n "confirm_trade_usd|large_trade_usd|approve_confirmation_mode|approve_force_confirm_multiple|RANKINGS_OPT_IN|rankings_prompted" skills/xaut-trade -S`
Expected: consistent terminology.

**Step 2: Lint-like syntax checks for changed YAML/Markdown references**
Run: `node -e "const fs=require('fs'); JSON.stringify(require('js-yaml').load(fs.readFileSync('skills/xaut-trade/SKILL.tests.yaml','utf8'))); console.log('OK')"`
Expected: `OK`

**Step 3: Review diff**
Run: `git diff -- skills/xaut-trade docs/plans`
Expected: only intended policy/docs changes.
