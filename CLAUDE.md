# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Agent Skills repository for the **aurehub** organization. Skills are structured Markdown packages that teach AI coding agents how to perform specific tasks, following the [Agent Skills specification](https://agentskills.io/specification).

## Repository Structure

```
skills/           # Each subdirectory is one skill
  <skill-name>/
    SKILL.md              # Required: YAML frontmatter + agent instructions
    SKILL.tests.yaml      # Test suite (smoke/full suites)
    README.md             # User-facing setup guide
    references/           # Progressive-disclosure docs loaded on demand
    scripts/              # Executable helpers (Node.js, Bash, etc.)
template/
  SKILL.md        # Boilerplate for creating new skills
scripts/
  publish-clawhub.sh    # Publish skills to ClawHub registry
```

## Skill Format

Every skill requires a `SKILL.md` with YAML frontmatter:

```yaml
---
name: my-skill-name          # lowercase, hyphens, matches directory name
description: What this skill does and when to trigger it
license: MIT
metadata:
  author: aurehub
  version: "1.0"
---
```

Body follows progressive disclosure: frontmatter (always loaded) -> body (on trigger) -> references/ (on demand).

## Common Commands

```bash
# Install skills from this repo
npx skills add aurehub/skills

# Publish single skill to ClawHub
./scripts/publish-clawhub.sh skills/<skill-name> <version>

# Publish all skills (auto-skip example-skill)
./scripts/publish-clawhub.sh --all <patch|minor|major>

# Dry-run publish
./scripts/publish-clawhub.sh --all minor --dry-run

# Run tests for xaut-trade scripts
cd skills/xaut-trade/scripts && npm test
```

## Conventions

- **Naming**: lowercase with hyphens for skill directories and slugs
- **ClawHub slugs**: auto-prefixed as `aurehub-<skill-name>` (use `--no-prefix` to override)
- **Global user config**: `~/.aurehub/` directory for `.env` and `config.yaml`
- **Commit messages**: conventional commits format
- **Language**: all user-facing content in English

## xaut-trade Skill Architecture

The main production skill (`skills/xaut-trade/`) handles XAUT (Tether Gold) trading on Ethereum via Uniswap V3 and UniswapX limit orders.

Key design:
- **Semi-automated**: agent previews trade, user confirms, agent executes
- **Safety gates**: double confirmation for large trades (>$1000) or high slippage (>50bps), hard-stops for insufficient gas or unsupported pairs
- **Wallet signing**: prefers Foundry keystore (`FOUNDRY_ACCOUNT`) over raw `PRIVATE_KEY`
- **Limit orders**: Node.js scripts using UniswapX SDK + ethers.js v5, requires `UNISWAPX_API_KEY`
- **Testing**: `SKILL.tests.yaml` defines 28 test cases in smoke (13) and full (28) suites
- **References**: 11 Markdown files covering onboarding, balance, quote, buy, sell, and limit order flows
