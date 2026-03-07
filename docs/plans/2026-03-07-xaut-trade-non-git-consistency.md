# xaut-trade Non-Git Consistency Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Normalize `xaut-trade` path handling so non-git installs work by default while preserving git as optional fallback.

**Architecture:** Use a single path-resolution standard anchored on `~/.aurehub/.setup_path`, then known install paths, then git fallback, then bounded `find` fallback. Apply this consistently across skill docs and setup-related scripts.

**Tech Stack:** Markdown documentation, Bash snippets, existing setup script behavior

**Design doc:** `docs/plans/2026-03-07-xaut-trade-non-git-consistency-design.md`

---

### Task 1: Inventory and classify remaining git-first patterns

**Files:**
- Read: `skills/xaut-trade/SKILL.md`
- Read: `skills/xaut-trade/README.md`
- Read: `skills/xaut-trade/references/*.md`
- Read: `skills/xaut-trade/scripts/setup.sh`

**Step 1: Run pattern inventory**
```bash
rg -n "git rev-parse --show-toplevel|find ~" skills/xaut-trade/SKILL.md skills/xaut-trade/README.md skills/xaut-trade/references/*.md skills/xaut-trade/scripts/setup.sh
```

**Step 2: Classify matches**
- Category A: should become non-git-first default.
- Category B: acceptable fallback mention.
- Category C: should be removed (e.g., unbounded home scan).

**Step 3: Commit inventory notes (optional)**
- Optional if no file changes yet.

---

### Task 2: Update SKILL.md path instructions to standard order

**Files:**
- Modify: `skills/xaut-trade/SKILL.md`

**Step 1: Update environment-failure Option A path-resolution text**
- Ensure order exactly matches design doc.
- Keep git as fallback, not first choice.

**Step 2: Update limit-order dependency check guidance**
- Replace git-root-only node_modules/npm path with resolved `SCRIPTS_DIR` guidance.

**Step 3: Ensure wording consistency with onboarding reference**
- Option B handoff must reference compatible commands.

**Step 4: Commit**
```bash
git add skills/xaut-trade/SKILL.md
git commit -m "fix(skill): standardize non-git-first path resolution guidance"
```

---

### Task 3: Update README setup instructions to non-git-first default

**Files:**
- Modify: `skills/xaut-trade/README.md`

**Step 1: Make automated setup command follow standard order**
- Primary command: `.setup_path` + known paths.
- Keep git fallback documented as optional path.

**Step 2: Remove or rewrite unbounded scan examples**
- Replace `find ~` with bounded roots and explicit depth.

**Step 3: Verify command examples are shell-safe in zsh/bash**
- Avoid nested quoting pitfalls.

**Step 4: Commit**
```bash
git add skills/xaut-trade/README.md
git commit -m "docs(readme): make setup path resolution non-git-first"
```

---

### Task 4: Update onboarding reference commands

**Files:**
- Modify: `skills/xaut-trade/references/onboarding.md`

**Step 1: Replace automated setup command block**
- Use standard order, same as README/SKILL language.

**Step 2: Replace git-root-dependent copy/install commands**
- `config.example.yaml` copy should resolve `SKILL_DIR` from setup path strategy.
- npm install should resolve `SCRIPTS_DIR` similarly.

**Step 3: Ensure Option B flow remains deterministic**
- If resolution fails, provide bounded fallback and explicit user prompt.

**Step 4: Commit**
```bash
git add skills/xaut-trade/references/onboarding.md
git commit -m "fix(onboarding): remove git-first assumptions in setup commands"
```

---

### Task 5: Align setup.sh messaging with documented path contract (if needed)

**Files:**
- Modify (if required): `skills/xaut-trade/scripts/setup.sh`

**Step 1: Verify setup-path persistence behavior**
- Confirm `~/.aurehub/.setup_path` is written reliably at completion.

**Step 2: Update only messaging/contract mismatches**
- Keep functional flow unchanged unless strictly needed for consistency.

**Step 3: Syntax check after edits**
```bash
bash -n skills/xaut-trade/scripts/setup.sh
```

**Step 4: Commit (only if changed)**
```bash
git add skills/xaut-trade/scripts/setup.sh
git commit -m "fix(setup): align setup path contract messaging with docs"
```

---

### Task 6: Verification-before-completion checklist

**Files:**
- Verify all modified files in `skills/xaut-trade/`

**Step 1: Syntax and tests**
```bash
bash -n skills/xaut-trade/scripts/setup.sh
cd skills/xaut-trade/scripts && npm test --silent
```

**Step 2: Residual-pattern scan**
```bash
rg -n "git rev-parse --show-toplevel|find ~" skills/xaut-trade/SKILL.md skills/xaut-trade/README.md skills/xaut-trade/references/*.md skills/xaut-trade/scripts/setup.sh
```

**Step 3: Diff scope review**
```bash
git diff -- skills/xaut-trade/
```
- Confirm only path guidance/consistency changes were made.

**Step 4: Report evidence**
- Include command outputs and any intentional remaining git fallback references.

