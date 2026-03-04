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
| [example-skill](skills/example-skill/) | A demo skill showing the standard structure |

## Creating a New Skill

1. Copy the [template](template/SKILL.md) into a new directory under `skills/`:

```bash
cp -r template skills/my-new-skill
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

## License

MIT
