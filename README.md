# aurehub/skills

A collection of reusable [Agent Skills](https://agentskills.io/specification) for AI coding agents.

## Installation

```bash
npx skills add aurehub/skills
```

Or manually copy the desired skill folder into your agent's skills directory.

## Available Skills

| Skill | Description |
|-------|-------------|
| [xaut-trade](skills/xaut-trade/) | Buy or sell XAUT (Tether Gold) on Ethereum via Uniswap V3 (market) and UniswapX (limit orders) |

## Creating a New Skill

1. Copy the [template](template/SKILL.md.template) into a new directory under `skills/`:

```bash
mkdir skills/my-new-skill
cp template/SKILL.md.template skills/my-new-skill/SKILL.md
```

2. Edit `skills/my-new-skill/SKILL.md`:
   - Set `name` to match the directory name (lowercase, hyphens only)
   - Write a clear `description` of what the skill does and when to use it
   - Add instructions in the Markdown body

3. Optionally add supporting files:
   - `references/` — additional documentation loaded on demand
   - `scripts/` — executable code the agent can run
   - `assets/` — templates, images, data files

### Skill Format

```yaml
---
name: my-skill-name
description: What this skill does and when to use it.
license: MIT
metadata:
  author: aurehub
  version: "1.0"
---

# Instructions for the agent

Step-by-step instructions, examples, and guidelines.
```

See the full [Agent Skills specification](https://agentskills.io/specification) for details.

## Contributing

1. Fork this repository
2. Create your skill directory under `skills/`
3. Ensure your `SKILL.md` follows the [spec](https://agentskills.io/specification)
4. Submit a pull request

## Local Guardrails

Enable git pre-commit checks:

```bash
./scripts/install-git-hooks.sh
```

Current checks:
- `scripts/check-no-runtime-private-key.sh`
- `scripts/check-skill-version.sh` (valid semver and version consistency between `SKILL.md` and `scripts/package.json` when present)

## License

MIT
