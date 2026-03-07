# Repo-wide Keystore Enforcement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enforce keystore-only runtime signing across all skills, remove runtime `PRIVATE_KEY` fallback paths, and provide a breaking-change migration path.

**Architecture:** Establish repository policy first, then migrate each affected skill implementation/documentation to a single runtime signing contract (`FOUNDRY_ACCOUNT` + `KEYSTORE_PASSWORD_FILE`), and finally enforce via tests and static checks.

**Tech Stack:** Markdown docs, shell scripts, Node.js helpers, ripgrep-based policy checks, existing skill test assets.

---

### Task 1: Inventory all runtime `PRIVATE_KEY` usage

**Files:**
- Modify: none
- Output artifact: `docs/plans/2026-03-07-repo-wide-keystore-enforcement-inventory.txt` (optional working note)

**Step 1: Scan repository for `PRIVATE_KEY` references**

Run:
```bash
rg -n "PRIVATE_KEY|--private-key|private key fallback|fallback mode" skills scripts README.md AGENTS.md
```
Expected: list all candidate paths to classify.

**Step 2: Classify findings by type**

Classification buckets:
- Runtime signing code path (must remove)
- Runtime instruction/reference (must remove)
- Onboarding import input only (may keep)
- Non-runtime examples/tests (review case-by-case)

**Step 3: Save/record classified list for implementation tracking**

Run (optional):
```bash
rg -n "PRIVATE_KEY|--private-key" skills > docs/plans/2026-03-07-repo-wide-keystore-enforcement-inventory.txt
```

**Step 4: Commit inventory note (optional)**

```bash
git add docs/plans/2026-03-07-repo-wide-keystore-enforcement-inventory.txt
git commit -m "chore: add repo-wide private-key usage inventory"
```

---

### Task 2: Add repository-level policy and review gates

**Files:**
- Modify: `AGENTS.md`
- Create: `scripts/check-no-runtime-private-key.sh`

**Step 1: Update repository policy docs**

In `AGENTS.md`, add explicit rule:
- Runtime `PRIVATE_KEY` signing is forbidden.
- `PRIVATE_KEY` is onboarding input only.
- Runtime must use keystore account + password file.

**Step 2: Add static policy check script**

Create `scripts/check-no-runtime-private-key.sh` that:
- Scans `skills/*` for forbidden runtime patterns (`--private-key`, runtime fallback wording).
- Allows onboarding import references in approved files by explicit whitelist.
- Exits non-zero with actionable output when violations exist.

**Step 3: Run script locally**

Run:
```bash
bash scripts/check-no-runtime-private-key.sh
```
Expected: currently fail before migration; pass after all migration tasks.

**Step 4: Commit policy + checker**

```bash
git add AGENTS.md scripts/check-no-runtime-private-key.sh
git commit -m "chore: enforce keystore-only runtime signing policy"
```

---

### Task 3: Migrate `xaut-trade` runtime signing to keystore-only

**Files:**
- Modify: `skills/xaut-trade/SKILL.md`
- Modify: `skills/xaut-trade/references/balance.md`
- Modify: `skills/xaut-trade/references/buy.md`
- Modify: `skills/xaut-trade/references/sell.md`
- Modify: `skills/xaut-trade/references/limit-order-*.md`
- Modify: `skills/xaut-trade/README.md`
- Modify: `skills/xaut-trade/scripts/limit-order.js`
- Modify: `skills/xaut-trade/SKILL.tests.yaml`

**Step 1: Remove runtime fallback language from docs**

Edit docs to remove instructions like:
- “If using private key fallback mode..."
- “Set `PRIVATE_KEY` as fallback” for runtime.

Add hard-stop messaging:
- If `PRIVATE_KEY` exists in runtime env, prompt migration and stop.

**Step 2: Enforce keystore-only in runtime helper**

In `scripts/limit-order.js`:
- Remove `privateKey` branch and ethers direct signing path.
- Require `FOUNDRY_ACCOUNT` and `KEYSTORE_PASSWORD_FILE`.
- Fail with explicit migration error if missing or if `PRIVATE_KEY` detected.

**Step 3: Normalize onboarding wording in `setup.sh` docs**

Ensure documented “new wallet” flow is direct keystore creation path, no plaintext key display path in recommended instructions.

**Step 4: Update tests to reflect new contract**

Add/adjust assertions in `SKILL.tests.yaml`:
- `PRIVATE_KEY` presence leads to hard-stop + migration guidance.
- Missing keystore/password file leads hard-stop.

**Step 5: Run targeted tests**

Run:
```bash
cd skills/xaut-trade/scripts && npm test
```
Expected: all pass.

**Step 6: Commit xaut-trade migration**

```bash
git add skills/xaut-trade
git commit -m "feat(xaut-trade): enforce keystore-only runtime signing"
```

---

### Task 4: Migrate other affected skills (if any) in batches

**Files:**
- Modify: any `skills/*` files found in Task 1 inventory

**Step 1: Repeat same keystore-only migration pattern per skill**

For each skill:
- Remove runtime `PRIVATE_KEY` signing branches.
- Update docs and tests.
- Add migration hard-stop messaging.

**Step 2: Verify each skill’s local tests/commands**

Run skill-specific test commands as documented.

**Step 3: Commit per skill/batch**

```bash
git add skills/<skill-name>
git commit -m "feat(<skill-name>): remove runtime private-key signing fallback"
```

---

### Task 5: Breaking-change versioning and release notes

**Files:**
- Modify: affected skill metadata versions (`SKILL.md` frontmatter)
- Modify: root `README.md` / skill README release notes sections as needed

**Step 1: Bump major versions for affected skills**

Example:
- `xaut-trade` -> `2.0.0`

**Step 2: Add migration notes**

Document:
- why runtime `PRIVATE_KEY` was removed
- exact migration commands
- expected hard-stop behavior

**Step 3: Commit version/docs updates**

```bash
git add skills README.md
git commit -m "chore: release major with keystore-only runtime signing"
```

---

### Task 6: Final verification and completion gate

**Files:**
- Modify: none

**Step 1: Run policy checker**

```bash
bash scripts/check-no-runtime-private-key.sh
```
Expected: pass.

**Step 2: Run repository grep sanity checks**

```bash
rg -n "--private-key|PRIVATE_KEY" skills
```
Expected: only onboarding-allowed references (if any), no runtime fallback text/code.

**Step 3: Run targeted skill tests**

```bash
cd skills/xaut-trade/scripts && npm test
```
Expected: pass.

**Step 4: Capture verification output in PR description**

Include:
- policy check output
- test output summary
- migration notes snippet

**Step 5: Final commit (if needed)**

```bash
git add -A
git commit -m "chore: finalize keystore-only enforcement verification"
```

---

## Notes for execution session

- Treat this as a strict breaking change.
- Do not leave dual-mode runtime code.
- Keep onboarding import capability, but runtime must stay keystore-only.
