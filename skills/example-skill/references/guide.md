# Agent Skills Quick Reference

## Directory Structure

```
skill-name/
├── SKILL.md              # Required — frontmatter + instructions
├── references/           # Optional — additional docs loaded on demand
├── scripts/              # Optional — executable code
└── assets/               # Optional — templates, images, data
```

## SKILL.md Frontmatter Fields

| Field           | Required | Description                              |
|-----------------|----------|------------------------------------------|
| `name`          | Yes      | Lowercase, hyphens only, max 64 chars    |
| `description`   | Yes      | What it does and when to use it, max 1024 chars |
| `license`       | No       | License name or reference                |
| `compatibility` | No       | Environment requirements                 |
| `metadata`      | No       | Arbitrary key-value pairs                |
| `allowed-tools` | No       | Pre-approved tools (experimental)        |

## Best Practices

- Keep `SKILL.md` under 500 lines
- Move detailed reference material to `references/`
- Use relative paths for file references
- Keep file references one level deep
