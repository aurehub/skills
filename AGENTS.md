# Repository Guidelines

## Project Structure & Module Organization
This repository stores reusable agent skills. Add new skills under `skills/<skill-name>/`. Each skill should include `SKILL.md`; optional files include `README.md`, `SKILL.tests.yaml`, `references/`, and `scripts/`. Use `template/SKILL.md.template` as the starting point for new skills. Repository-level automation lives in `scripts/`, including `scripts/publish-clawhub.sh`.

## Build, Test, and Development Commands
Install the skill collection locally with `npx skills add aurehub/skills`. Create a new skill from the template with `mkdir skills/my-new-skill && cp template/SKILL.md.template skills/my-new-skill/SKILL.md`. Run the existing script tests from `skills/xaut-trade/scripts/` with `npm test`. Publish one skill with `./scripts/publish-clawhub.sh skills/<skill-name> <version>`. Publish all non-example skills with `./scripts/publish-clawhub.sh --all patch`. Add `--dry-run` before publishing to preview changes.

## Coding Style & Naming Conventions
Skill directory names and frontmatter `name` values must be lowercase and hyphenated, and they should match exactly, for example `skills/xaut-trade/` and `name: xaut-trade`. Keep user-facing content in English. Write concise Markdown instructions with progressive disclosure: core workflow in `SKILL.md`, detailed material in `references/`, and executable helpers in `scripts/`.

## Testing Guidelines
Add or update `SKILL.tests.yaml` when a skill has trigger logic or structured behavior to validate. For script-backed skills, keep tests close to the code, for example `skills/xaut-trade/scripts/__tests__/helpers.test.js`. Name test files `*.test.js` for Node helpers. Run targeted tests in the package directory before opening a PR.

## Commit & Pull Request Guidelines
Follow the conventional style already used in git history: `feat:`, `chore:`, `refactor:`, `i18n:`. Keep commit scopes focused on one skill or one repo-level change. Pull requests should explain what changed, list affected skills, mention any new commands or config files, and include sample prompts or terminal output when behavior changes.

## Superpowers Workflow
When operating as an AI coding agent in this repository, follow this process:
1. Use `using-superpowers` before any action.
2. For multi-step implementation tasks, run `writing-plans` first, then execute via `executing-plans`.
3. Before claiming completion (or before commit/PR), run verification per `verification-before-completion`.
4. For PR/code review requests, default to read-only analysis. Do not edit files unless the user explicitly requests changes.

## Security & Configuration Tips
Do not commit secrets or wallet credentials. If a skill needs local configuration, provide an example file such as `config.example.yaml` and document required environment variables in the skill README.

## Wallet Signing Policy (Repo-wide)
- Runtime signing with `PRIVATE_KEY` is forbidden in all skills.
- Runtime signing must use one of the approved wallet backends:
  - Foundry keystore: `FOUNDRY_ACCOUNT` + `KEYSTORE_PASSWORD_FILE`
  - WDK encrypted vault: `WDK_PASSWORD_FILE` (+ `WDK_VAULT_FILE` when explicitly configured)
- `PRIVATE_KEY` may be used only as one-time onboarding input for keystore import (e.g. `cast wallet import --interactive`), never as runtime signing configuration.
- Wallet initialization flows must stay within approved methods:
  - Import existing private key into Foundry keystore (interactive)
  - Create new wallet directly into Foundry keystore
  - Create new encrypted WDK vault wallet
