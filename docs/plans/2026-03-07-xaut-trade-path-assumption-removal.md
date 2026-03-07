# xaut-trade Path Assumption Removal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove remaining environment-specific path assumptions and unify setup path resolution across xaut-trade docs/scripts.

**Architecture:** Use one generic resolution order (`.setup_path -> git fallback -> bounded $HOME find`) and apply it consistently in docs; harden temp files in Node script.

**Tech Stack:** Markdown docs, Bash snippets, Node.js filesystem APIs

**Design doc:** `docs/plans/2026-03-07-xaut-trade-path-assumption-removal-design.md`

---

### Task 1: Standardize SKILL.md path resolution guidance

**Files:**
- Modify: `skills/xaut-trade/SKILL.md`

**Steps:**
1. Replace hardcoded known-path list with generic strategy (`.setup_path`, git fallback, bounded `$HOME` find).
2. Update limit-order dependency check guidance to use the same generic `SCRIPTS_DIR` strategy.
3. Commit:
```bash
git add skills/xaut-trade/SKILL.md
git commit -m "fix(skill): remove product-specific setup path assumptions"
```

### Task 2: Standardize README setup and manual command snippets

**Files:**
- Modify: `skills/xaut-trade/README.md`

**Steps:**
1. Replace hardcoded path list in automated setup snippet with generic strategy.
2. Keep execution guard (`[ -n "$SETUP_PATH" ] && [ -f "$SETUP_PATH" ]`) before `bash`.
3. Update manual config/npm snippets to derive from resolved setup path.
4. Commit:
```bash
git add skills/xaut-trade/README.md
git commit -m "docs(readme): standardize generic setup path resolution"
```

### Task 3: Standardize onboarding snippets and guard empty fallbacks

**Files:**
- Modify: `skills/xaut-trade/references/onboarding.md`

**Steps:**
1. Replace hardcoded path list with generic strategy in automated setup section.
2. Replace `bash "$(find ... | head -1)"` with explicit variable resolution + guard.
3. Ensure config/npm blocks reuse same generic strategy.
4. Commit:
```bash
git add skills/xaut-trade/references/onboarding.md
git commit -m "fix(onboarding): remove hardcoded install-path assumptions"
```

### Task 4: Harden `limit-order.js` temporary file handling

**Files:**
- Modify: `skills/xaut-trade/scripts/limit-order.js`

**Steps:**
1. Use `os.tmpdir()` + `fs.mkdtempSync(...)` + `path.join(...)` for typed-data temp file.
2. Ensure recursive cleanup of temp directory in `finally`.
3. Commit:
```bash
git add skills/xaut-trade/scripts/limit-order.js
git commit -m "fix(limit-order): use robust temporary file handling"
```

### Task 5: Verification-before-completion

**Steps:**
1. Run:
```bash
bash -n skills/xaut-trade/scripts/setup.sh
cd skills/xaut-trade/scripts && npm test --silent
```
2. Run scan:
```bash
rg -n "\$HOME/\.claude|\$HOME/\.agents|\$HOME/\.aurehub/\.agents|bash \"\$\(find .*head -1\)\"" skills/xaut-trade/SKILL.md skills/xaut-trade/README.md skills/xaut-trade/references/onboarding.md
```
3. Review scope:
```bash
git diff -- skills/xaut-trade/SKILL.md skills/xaut-trade/README.md skills/xaut-trade/references/onboarding.md skills/xaut-trade/scripts/limit-order.js
```

