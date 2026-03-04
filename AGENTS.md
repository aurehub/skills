# Repository Guidelines

## Project Structure & Module Organization
This repository stores reusable agent skills. Add new skills under `skills/<skill-name>/`. Each skill should include `SKILL.md`; optional files include `README.md`, `SKILL.tests.yaml`, `references/`, and `scripts/`. Use `template/SKILL.md` as the starting point for new skills. Repository-level automation lives in `scripts/`, including `scripts/publish-clawhub.sh`.

## Build, Test, and Development Commands
Install the skill collection locally with `npx skills add aurehub/skills`. Create a new skill from the template with `cp -r template skills/my-new-skill`. Run the existing script tests from `skills/xaut-trade/scripts/` with `npm test`. Publish one skill with `./scripts/publish-clawhub.sh skills/<skill-name> <version>`. Publish all non-example skills with `./scripts/publish-clawhub.sh --all patch`. Add `--dry-run` before publishing to preview changes.

## Coding Style & Naming Conventions
Skill directory names and frontmatter `name` values must be lowercase and hyphenated, and they should match exactly, for example `skills/xaut-trade/` and `name: xaut-trade`. Keep user-facing content in English. Write concise Markdown instructions with progressive disclosure: core workflow in `SKILL.md`, detailed material in `references/`, and executable helpers in `scripts/`.

## Testing Guidelines
Add or update `SKILL.tests.yaml` when a skill has trigger logic or structured behavior to validate. For script-backed skills, keep tests close to the code, for example `skills/xaut-trade/scripts/__tests__/helpers.test.js`. Name test files `*.test.js` for Node helpers. Run targeted tests in the package directory before opening a PR.

## Commit & Pull Request Guidelines
Follow the conventional style already used in git history: `feat:`, `chore:`, `refactor:`, `i18n:`. Keep commit scopes focused on one skill or one repo-level change. Pull requests should explain what changed, list affected skills, mention any new commands or config files, and include sample prompts or terminal output when behavior changes.

## Security & Configuration Tips
Do not commit secrets or wallet credentials. If a skill needs local configuration, provide an example file such as `config.example.yaml` and document required environment variables in the skill README.
