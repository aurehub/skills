# xaut-trade Path Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden onboarding/setup paths for non-git installs and eliminate remaining brittle path/documentation issues.

**Architecture:** Keep existing non-git-first path strategy. Apply focused hardening in README + onboarding + setup script without changing trade logic.

**Tech Stack:** Markdown docs, Bash shell scripting

**Design doc:** `docs/plans/2026-03-07-xaut-trade-path-hardening-design.md`

---

### Task 1: Guard README automated setup execution path

**Files:**
- Modify: `skills/xaut-trade/README.md`

**Step 1: Make setup execution conditional**
- Replace unconditional `bash "$_s"` with guard:
  - if resolved path exists: execute
  - otherwise print a bounded search command / guidance and exit non-zero

**Step 2: Verify exact command snippet readability**
- Ensure snippet remains valid for zsh/bash users.

**Step 3: Commit**
```bash
git add skills/xaut-trade/README.md
git commit -m "docs(readme): guard setup execution when path resolution fails"
```

---

### Task 2: Remove repo-relative manual commands in README

**Files:**
- Modify: `skills/xaut-trade/README.md`

**Step 1: Replace manual config copy command**
- Replace `cp skills/xaut-trade/config.example.yaml ~/.aurehub/config.yaml`
- Use resolved `SKILL_DIR` snippet compatible with non-git installs.

**Step 2: Replace manual npm install command**
- Replace `cd skills/xaut-trade/scripts && npm install`
- Use resolved `SCRIPTS_DIR` snippet compatible with non-git installs.

**Step 3: Commit**
```bash
git add skills/xaut-trade/README.md
git commit -m "docs(readme): make manual setup commands install-location agnostic"
```

---

### Task 3: Harden onboarding git fallback execution

**Files:**
- Modify: `skills/xaut-trade/references/onboarding.md`

**Step 1: Validate git fallback path before invoking bash**
- Update fallback block so git path is used only when file exists.
- Keep bounded find fallback as final option.

**Step 2: Keep flow semantics unchanged**
- Preserve current A/B onboarding behavior; only improve robustness.

**Step 3: Commit**
```bash
git add skills/xaut-trade/references/onboarding.md
git commit -m "fix(onboarding): validate git fallback path before setup execution"
```

---

### Task 4: Align setup.sh message and harden temp-file usage

**Files:**
- Modify: `skills/xaut-trade/scripts/setup.sh`

**Step 1: Update obsolete wallet-import wording**
- Replace message that references `cast wallet import` with current wallet-new/password-file flow wording.

**Step 2: Replace fixed /tmp filenames with mktemp**
- For cast error capture file.
- For temporary `.env` rewrite file.
- Ensure temp files are cleaned up.

**Step 3: Run syntax check**
```bash
bash -n skills/xaut-trade/scripts/setup.sh
```

**Step 4: Commit**
```bash
git add skills/xaut-trade/scripts/setup.sh
git commit -m "fix(setup): update wallet message and use safe temp files"
```

---

### Task 5: Verification-before-completion evidence

**Files:**
- Verify modified files only

**Step 1: Script syntax and tests**
```bash
bash -n skills/xaut-trade/scripts/setup.sh
cd skills/xaut-trade/scripts && npm test --silent
```

**Step 2: Residual issue scan**
```bash
rg -n "bash \"\$_s\"$|cp skills/xaut-trade/config.example.yaml|cd skills/xaut-trade/scripts|cast wallet import|/tmp/xaut_cast_err|/tmp/.env.tmp" \
  skills/xaut-trade/README.md skills/xaut-trade/references/onboarding.md skills/xaut-trade/scripts/setup.sh
```

**Step 3: Final scope check**
```bash
git diff -- skills/xaut-trade/README.md skills/xaut-trade/references/onboarding.md skills/xaut-trade/scripts/setup.sh
```

