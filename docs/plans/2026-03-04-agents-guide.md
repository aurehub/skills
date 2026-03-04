# AGENTS Guide Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a root `AGENTS.md` contributor guide tailored to this repository's skill layout, commands, and conventions.

**Architecture:** The change is documentation-only. The guide should reflect the existing repository structure (`skills/`, `template/`, `scripts/`), current commands from `README.md` and `CLAUDE.md`, and commit conventions inferred from recent git history.

**Tech Stack:** Markdown, git history, repository docs

---

### Task 1: Draft the contributor guide

**Files:**
- Create: `AGENTS.md`
- Reference: `README.md`
- Reference: `CLAUDE.md`
- Reference: `skills/xaut-trade/scripts/package.json`

**Step 1: Gather source facts**

Review the existing docs and package metadata to capture:
- repository structure
- install, test, and publish commands
- naming and language conventions

**Step 2: Write the guide**

Create `AGENTS.md` with:
- title `Repository Guidelines`
- concise sections for structure, commands, style, testing, commits/PRs
- examples using real paths and commands from this repo

**Step 3: Keep it scoped**

Ensure the guide stays within roughly 200-400 words and avoids generic guidance that is not supported by the repo.

**Step 4: Verify**

Check that:
- the file exists at the repo root
- the title is correct
- commands and paths match the repository

**Step 5: Commit**

```bash
git add AGENTS.md docs/plans/2026-03-04-agents-guide.md
git commit -m "docs: add repository contributor guide"
```
