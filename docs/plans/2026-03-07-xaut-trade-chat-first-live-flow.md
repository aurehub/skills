# xaut-trade Chat-first Live Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make xaut-trade live usage documentation and environment fallback behavior Chat-first (Agent-driven by default, minimal mandatory user intervention).

**Architecture:** Update behavior contract in `SKILL.md`, rewrite live runbook around chat interaction, and align README entry wording.

**Tech Stack:** Markdown docs (`SKILL.md`, `README.md`, `references/*.md`), existing shell validation scripts.

---

### Task 1: Switch environment fallback recommendation to Agent-first

**Files:**
- Modify: `skills/xaut-trade/SKILL.md`

**Step 1: Update option ordering and wording**
- A: Agent-guided setup (recommended)
- B: manual setup.sh (fallback)

**Step 2: Update continuation logic text**
- A path loads onboarding guide
- B path re-runs readiness checks after manual completion

**Step 3: Verify text consistency**
Run:
```bash
rg -n "Environment not ready|Please choose|Recommended|fallback" skills/xaut-trade/SKILL.md
```

---

### Task 2: Rewrite live runbook to Chat-first structure

**Files:**
- Modify: `skills/xaut-trade/references/live-trading-runbook.md`

**Step 1: Replace shell-first sections with role-based flow**
- Agent responsibilities
- User mandatory checkpoints only

**Step 2: Keep manual commands only in fallback appendix**

**Step 3: Verify required checkpoints are explicit**
Run:
```bash
rg -n "confirm execute|manual checkpoints|interactive|funding|fallback" skills/xaut-trade/references/live-trading-runbook.md
```

---

### Task 3: Align README entry wording

**Files:**
- Modify: `skills/xaut-trade/README.md`

**Step 1: Update runbook link sentence**
- Clearly mark as “chat-first, Agent-driven”.

**Step 2: Verify link and wording**
Run:
```bash
rg -n "live-trading-runbook|chat-first|Agent-driven" skills/xaut-trade/README.md
```

---

### Task 4: Verification

**Files:**
- Modify: none

**Step 1: syntax/policy check**
Run:
```bash
bash -n skills/xaut-trade/scripts/setup.sh
bash scripts/check-no-runtime-private-key.sh
```

**Step 2: test check**
Run:
```bash
cd skills/xaut-trade/scripts && npm test
```

**Step 3: final status**
Run:
```bash
git status --short
```

---

### Task 5: Commit

**Step 1: Stage changes**
```bash
git add docs/plans/2026-03-07-xaut-trade-chat-first-live-flow-design.md \
        docs/plans/2026-03-07-xaut-trade-chat-first-live-flow.md \
        skills/xaut-trade/SKILL.md \
        skills/xaut-trade/README.md \
        skills/xaut-trade/references/live-trading-runbook.md
```

**Step 2: Commit**
```bash
git commit -m "docs(xaut-trade): switch live flow guidance to chat-first"
```
