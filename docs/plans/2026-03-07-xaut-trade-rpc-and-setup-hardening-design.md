# xaut-trade RPC and Setup Hardening Design

## Context

Recent live-trade validation surfaced practical reliability gaps:
- setup wallet creation failed on Foundry CLI flag differences
- RPC fallback did not consistently recover from real provider errors (`-32603`, 403 whitelist)
- dry-run could fail due to node policy while send still succeeds
- setup key input accepted accidental values too easily

## Goal

Improve production robustness without increasing mandatory user burden:
- keep Chat-first execution model
- keep user intervention only for required manual checkpoints
- make setup and RPC handling more resilient across real environments

## Scope

Primary scope: `skills/xaut-trade`.

Touched surfaces:
- `scripts/setup.sh`
- `SKILL.md`
- `references/buy.md` / runbook docs as needed
- optional helper script sections for fallback logic documentation

## Design

### A) Foundry Capability-first Compatibility

1. Detect command capability from `cast wallet new --help`.
2. Wallet creation path matrix:
- supports `--password-file` -> use non-interactive file mode
- supports named account but no `--password-file` -> use supported flag variant (`--password`/interactive prompt guidance)
- unsupported shape -> provide explicit upgrade+fallback guidance, do not fail silently
3. Keep version warning informational unless a required capability is missing.

### B) RPC Fallback Hardening (Read/Write Aware)

1. Expand fallback trigger patterns to include:
- `-32603`, `no response`
- `403`, `method is not whitelisted`
- existing timeout/rate-limit patterns
2. Track/read route separately by operation type:
- read ops (`cast call`, quote, balances)
- write ops (`cast send`)
3. Session stickiness remains, but stickiness is per operation class when needed.
4. Keep default public RPC flow; recommend user-owned paid RPC only after repeated instability.

### C) Dry-run Safety Logic Refinement

1. Dry-run failures caused by node policy/network should retry on alternate read-capable RPC before hard-stop.
2. Hard-stop only when all read-capable endpoints fail.
3. Keep `confirm execute` mandatory gate unchanged.

### D) Setup Input Validation / UX Clarity

1. UniswapX key flow becomes explicit-choice (set now / skip / keep existing).
2. Validate non-empty, trimmed key before write.
3. Final setup summary explicitly states:
- market orders ready/not ready
- limit orders ready/not ready and missing items

## Non-goals

- No protocol-level trading logic rewrite.
- No forced paid RPC requirement.

## Risks

1. Increased branching complexity in setup script.
- Mitigation: clear capability checks + concise branches + comments.

2. Over-aggressive fallback may hide real contract errors.
- Mitigation: fallback only on network/policy signature errors, never on revert/parameter errors.

## Acceptance Criteria

1. Setup succeeds on current and slightly older Foundry variants without manual patching.
2. Live flow survives transient/public RPC failures more reliably.
3. Dry-run no longer hard-fails immediately on provider whitelist issues when alternates are available.
4. Setup input for API key avoids accidental invalid writes.
