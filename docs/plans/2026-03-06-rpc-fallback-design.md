# RPC Fallback Design

**Date:** 2026-03-06
**Skill:** xaut-trade
**Branch:** feature/security_enhance

## Problem

`ETH_RPC_URL` defaults to `https://eth.llamarpc.com`. In production, Cloudflare rate limiting (HTTP 429) on this endpoint causes transactions to fail. There is no automatic recovery mechanism.

## Goals

- Automatically switch to a working RPC when the primary fails with a network error
- Remain on the selected RPC for the rest of the session (no unnecessary switching)
- Allow users to customize the fallback list (e.g. add a paid Alchemy/Infura node)
- No overhead when the primary RPC is healthy

## Non-Goals

- Proactive health checks or latency-based selection
- Persisting the selected fallback across sessions
- Handling non-network errors (contract reverts, insufficient balance) via RPC switching

## Approach: Passive Network-Error-Aware Fallback

Trigger fallback **only** on network errors. Distinguish from contract/application errors so users get accurate error messages without spurious retries.

**Network errors (trigger fallback):** 429, 502, 503, timeout, connection refused, rate limit

**Non-network errors (report directly):** insufficient balance, contract revert, invalid params, nonce mismatch

### cast send safety

If `cast send` fails with a network error, retry with the same signed command on the fallback RPC. The transaction bytes are identical, so the txhash is the same. Ethereum mempool deduplicates by txhash — the transaction executes at most once.

### Session stickiness

Once a fallback RPC is selected, the agent uses it for all remaining commands in the session via its conversation context. No explicit writes required. Primary RPC is never retried after a successful fallback switch.

## Configuration

### New variable: `ETH_RPC_URL_FALLBACK`

Comma-separated ordered list of fallback RPC URLs. Tried in order until one succeeds.

**Default value:**
```
ETH_RPC_URL_FALLBACK=https://eth.merkle.io,https://rpc.flashbots.net/fast,https://eth.drpc.org,https://ethereum.publicnode.com
```

All four endpoints verified functional as of 2026-03-06. Selected for diversity of operators and no API key requirement.

Users may prepend a paid node (Alchemy/Infura) for higher reliability.

## File Changes

### `skills/xaut-trade/.env.example`
Add `ETH_RPC_URL_FALLBACK` line after `ETH_RPC_URL`.

### `skills/xaut-trade/references/onboarding.md`
Step 3 heredoc: add `ETH_RPC_URL_FALLBACK` line so new users get fallback configured automatically. Extend the RPC note to mention paid nodes can be added to `ETH_RPC_URL_FALLBACK`.

### `skills/xaut-trade/README.md`
- `.env` config table: add `ETH_RPC_URL_FALLBACK` row
- `.env` example block (line ~72): add the new variable

### `skills/xaut-trade/SKILL.md`
1. Add **RPC Fallback** section after Environment Readiness Check:
   - Parse `ETH_RPC_URL_FALLBACK` as comma-separated list
   - On network error: try each fallback in order with same command
   - On first success: use that RPC for all remaining session commands
   - All fallbacks exhausted: hard-stop with message directing user to add a paid RPC
2. Update **Error Handling** section: replace generic "RPC unavailable" with reference to RPC Fallback section

## Fallback Node List

| URL | Operator | Notes |
|-----|----------|-------|
| `https://eth.merkle.io` | Merkle | Low latency, no API key |
| `https://rpc.flashbots.net/fast` | Flashbots | MEV protection, stable |
| `https://eth.drpc.org` | dRPC | Decentralized, widely used |
| `https://ethereum.publicnode.com` | Allnodes | Privacy-first, no API key |
