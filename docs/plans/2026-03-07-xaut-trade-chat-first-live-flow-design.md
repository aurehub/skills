# xaut-trade Chat-first Live Flow Design

## Context

Current documentation still emphasizes manual shell execution paths, which conflicts with the desired interaction model where the Agent drives setup/trading and the user only intervenes at mandatory checkpoints.

## Goal

Align `xaut-trade` interaction design to Chat-first:
- Agent executes all automatable steps.
- User intervenes only for mandatory sensitive/manual checkpoints.

## UX Contract

Mandatory user checkpoints only:
1. Sensitive wallet input (interactive import/password)
2. Wallet funding (ETH/USDT/XAUT)
3. Final on-chain execution confirmation (`confirm execute`)

Everything else should be Agent-driven by default.

## Proposed Changes

1. `SKILL.md`
- In environment-not-ready branch, switch recommendation order:
  - A = Agent-guided setup (recommended)
  - B = manual setup.sh fallback
- Keep both options, but default path is chat-guided.

2. `references/live-trading-runbook.md`
- Rewrite as Chat-first mainnet runbook.
- Move shell-heavy instructions to fallback section.
- Explicitly map Agent responsibilities vs user checkpoints.

3. `README.md`
- Update runbook entry text to clearly label chat-first intent.

## Non-goals

- No script architecture change in this iteration.
- No changes to core quote/trade command implementations.

## Risks

1. Users may assume full automation without confirmation.
- Mitigation: repeat `confirm execute` gate in runbook and skill.

2. Environment-specific terminal limitations for interactive prompts.
- Mitigation: keep manual `setup.sh` fallback.

## Acceptance Criteria

1. `SKILL.md` environment fallback branch recommends Agent-guided setup first.
2. New runbook is chat-first and only lists three mandatory user checkpoints.
3. README explicitly points to chat-first runbook.
4. No regressions in existing script/test checks.
