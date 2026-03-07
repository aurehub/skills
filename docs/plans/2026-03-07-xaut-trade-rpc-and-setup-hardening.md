# xaut-trade RPC and Setup Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden setup compatibility and RPC resilience for live xaut-trade execution while preserving Chat-first interaction.

**Architecture:** Add capability-based setup branching, expand network/policy fallback handling, refine dry-run retry semantics, and tighten setup input UX.

**Tech Stack:** Bash (`setup.sh`), markdown flow docs (`SKILL.md`, `references/*.md`), existing local validation commands.

---

### Task 1: Foundry capability-based setup compatibility

**Files:**
- Modify: `skills/xaut-trade/scripts/setup.sh`

**Step 1: Add `cast wallet new` capability parsing**
- Probe help output once and branch by supported flags/argument shape.

**Step 2: Implement creation matrix**
- `--password-file` path when available.
- compatible fallback path when not available.
- clear actionable upgrade message only when required capability is absent.

**Step 3: Verify script syntax**
Run:
```bash
bash -n skills/xaut-trade/scripts/setup.sh
```
Expected: no syntax error.

---

### Task 2: Expand RPC fallback trigger handling

**Files:**
- Modify: `skills/xaut-trade/SKILL.md`
- Modify: `skills/xaut-trade/references/buy.md`
- Modify: `skills/xaut-trade/references/sell.md` (if needed for parity)

**Step 1: Extend documented trigger signatures**
Include `-32603`, `no response`, and provider whitelist 403 patterns.

**Step 2: Clarify read/write fallback expectations**
Add concise guidance that fallback applies to both read and write paths, with operation-aware behavior.

**Step 3: Validate doc consistency**
Run:
```bash
rg -n "32603|no response|whitelist|fallback|cast call|cast send" skills/xaut-trade/SKILL.md skills/xaut-trade/references/buy.md skills/xaut-trade/references/sell.md
```

---

### Task 3: Refine dry-run behavior documentation

**Files:**
- Modify: `skills/xaut-trade/references/buy.md`
- Modify: `skills/xaut-trade/references/sell.md`

**Step 1: Update dry-run error branch**
- Retry on alternate read-capable RPC before hard-stop.
- Hard-stop only when all candidate nodes fail.

**Step 2: Preserve confirmation gate semantics**
Ensure no wording reduces `confirm execute` requirement.

---

### Task 4: Setup API-key input validation UX

**Files:**
- Modify: `skills/xaut-trade/scripts/setup.sh`

**Step 1: Replace free-form prompt with explicit choice flow**
- set now / skip / keep existing

**Step 2: Validate and trim input before writing**
- reject empty/blank writes
- do not overwrite existing value unless user chooses to set

**Step 3: Improve summary output readiness states**
- market ready/not ready
- limit ready/not ready

---

### Task 5: Verification

**Files:**
- Modify: none

**Step 1: Syntax and policy checks**
Run:
```bash
bash -n skills/xaut-trade/scripts/setup.sh
bash scripts/check-no-runtime-private-key.sh
```

**Step 2: Script tests**
Run:
```bash
cd skills/xaut-trade/scripts && npm test
```

**Step 3: Diff sanity**
Run:
```bash
git diff --stat
```

---

### Task 6: Commit

**Step 1: Stage modified files**
```bash
git add docs/plans/2026-03-07-xaut-trade-rpc-and-setup-hardening-design.md \
        docs/plans/2026-03-07-xaut-trade-rpc-and-setup-hardening.md \
        skills/xaut-trade/scripts/setup.sh \
        skills/xaut-trade/SKILL.md \
        skills/xaut-trade/references/buy.md \
        skills/xaut-trade/references/sell.md
```

**Step 2: Commit**
```bash
git commit -m "fix(xaut-trade): harden setup compatibility and rpc fallback handling"
```
