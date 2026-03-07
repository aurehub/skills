# XAUT Trade Confirmation and Rankings Prompt Design

## Context
Current xaut-trade behavior uses fixed explicit confirmations before approve/swap and silently skips rankings registration when `RANKINGS_OPT_IN=false`. This is safe but creates friction for frequent users and misses post-success conversion timing.

## Goals
- Keep backward compatibility with existing config and field names.
- Make trade confirmation thresholds clearer with USD semantics.
- Reduce repetitive approve confirmations while preserving safety.
- Add one-time, post-success rankings prompt without changing default opt-in policy.

## Decisions
1. Keep `risk.large_trade_usd` unchanged for double-confirmation threshold.
2. Add `risk.confirm_trade_usd` (USD) for single-confirmation threshold.
3. Add `risk.approve_confirmation_mode` with default `first_only`.
4. Add `risk.approve_force_confirm_multiple` default `10`.
5. Keep `RANKINGS_OPT_IN=false` default.
6. Add first successful-trade prompt when rankings are not enabled and no prior decision marker exists.

## Confirmation Policy
- Trade notional `< confirm_trade_usd`: no mandatory execution confirmation.
- `>= confirm_trade_usd` and `< large_trade_usd`: single execution confirmation.
- `>= large_trade_usd` or high-slippage warning: double confirmation.
- Approve path respects `approve_confirmation_mode`, but force-confirm if approve amount > `approve_force_confirm_multiple * amount_in`.

## Rankings Prompt Policy
- Trigger point: immediately after first successful on-chain trade.
- Preconditions: `RANKINGS_OPT_IN != true`, wallet not already in `~/.aurehub/.registered`, no marker in `~/.aurehub/.rankings_prompted`.
- User says yes: ask nickname if missing, set env vars, attempt registration.
- User says no: write marker and stop prompting.

## Scope
- Documentation/spec updates only (`SKILL.md`, references, README, config example, behavior tests).
- No breaking rename of existing fields.

## Risks and Mitigations
- Risk: ambiguity between old and new confirmation phrasing.
  - Mitigation: add explicit priority order and examples.
- Risk: prompt spam.
  - Mitigation: one-time marker file.
