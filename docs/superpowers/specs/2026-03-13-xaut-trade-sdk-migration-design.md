# xaut-trade: SDK Migration & WDK Wallet Integration

**Date:** 2026-03-13
**Status:** Approved (pending implementation plan)

## Goals

1. Replace `cast call/send` with `@uniswap/v3-sdk` + `ethers.js v6` for all market order operations (quote, balance, allowance, approve, swap).
2. Add WDK wallet management as a recommended alternative to Foundry keystore.
3. Keep `limit-order.js` unchanged (ethers v5 + UniswapX SDK).

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│  Foundry Wallet  │     │    WDK Wallet    │
│  (advanced)      │     │  (recommended)   │
│  create/import   │     │  seed-based      │
└────────┬────────┘     └────────┬────────┘
         │ decrypt keystore       │ derive from mnemonic
         ▼                       ▼
   ┌──────────────────────────────────┐
   │     ethers.js v6 Wallet/Signer   │
   │        (unified signing layer)   │
   └──────────────┬───────────────────┘
                  ▼
   ┌──────────────────────────────────┐
   │   @uniswap/v3-sdk + ethers.js   │
   │   (quote, approve, swap)        │
   └──────────────────────────────────┘
```

Both wallet backends produce a standard `ethers.Wallet` instance. All trading logic is wallet-agnostic.

## Directory Structure

```
skills/xaut-trade/scripts/
├── market/                          # NEW: ethers v6 + Uniswap v3-sdk
│   ├── package.json                 # ethers@^6, @uniswap/v3-sdk@^3, @uniswap/sdk-core@^6
│   ├── swap.js                      # CLI entry (subcommands: quote, balance, approve, swap)
│   └── lib/
│       ├── signer.js                # Dual wallet backend → ethers.Wallet
│       ├── provider.js              # RPC provider + automatic fallback
│       ├── uniswap.js               # Quote + swap calldata generation
│       ├── erc20.js                 # Balance / allowance / approve
│       ├── config.js                # Read ~/.aurehub/.env + config.yaml
│       └── create-wallet.js         # WDK seed generation (called by setup.sh)
├── limit-order.js                   # UNCHANGED (ethers v5)
├── helpers.js                       # UNCHANGED
├── setup.sh                         # MODIFIED: add wallet mode selection
└── package.json                     # UNCHANGED (limit-order dependencies)
```

## Module Design

### `swap.js` — CLI Entry Point

Subcommands and their module mappings:

| Subcommand | Calls | Requires Signer |
|------------|-------|-----------------|
| `quote`    | `uniswap.quote()` | No (provider only) |
| `balance`  | `erc20.getBalance()` | No |
| `approve`  | `erc20.approve()` | Yes |
| `swap`     | `uniswap.buildSwap()` → `signer.sendTransaction()` | Yes |

All subcommands output JSON to stdout for agent parsing.

### `lib/signer.js` — Unified Signing Layer

```javascript
async function createSigner(provider) → ethers.Wallet
```

1. Read `wallet_mode` from `~/.aurehub/config.yaml`.
2. If `wallet_mode` is not set → throw error instructing user to run setup.
3. Branch:

**Foundry mode (`wallet_mode: foundry`):**
- Read keystore JSON from `~/.foundry/keystores/<FOUNDRY_ACCOUNT>`
- Read password from `KEYSTORE_PASSWORD_FILE`
- `ethers.Wallet.fromEncryptedJson(json, password).connect(provider)`

**WDK mode (`wallet_mode: wdk`):**
- Read mnemonic from seed file path in `config.yaml` (default `~/.aurehub/.wdk_seed`)
- `ethers.Wallet.fromPhrase(mnemonic).connect(provider)`

Passwords and mnemonics are held in memory only during decryption, not cached.

### `lib/provider.js` — RPC Provider with Fallback

```javascript
async function createProvider() → ethers.JsonRpcProvider
```

- Primary: `ETH_RPC_URL` from `~/.aurehub/.env`
- Fallback list: `ETH_RPC_URL_FALLBACK` (comma-separated)
- Auto-switch on: 429, 502, 503, timeout, rate limit
- Session-sticky: successful fallback becomes active for remainder of process

### `lib/uniswap.js` — Quote & Swap

```javascript
async function quote({ side, amountIn, tokenIn, tokenOut, fee }) → { amountOut, sqrtPriceX96, gasEstimate }
async function buildSwap({ side, amountIn, minAmountOut, tokenIn, tokenOut, fee, recipient, deadline }) → { to, data, value }
```

- `quote`: Call QuoterV2 contract via ethers Contract (read-only, no signer needed).
- `buildSwap`: Use `@uniswap/v3-sdk` `SwapRouter.swapCallParameters()` to generate calldata. Returns raw tx params `{ to, data, value }`.
- Caller sends via `signer.sendTransaction(txParams)`.

### `lib/erc20.js` — Token Operations

```javascript
async function getBalance(token, address, provider) → string
async function getAllowance(token, owner, spender, provider) → string
async function approve(token, spender, amount, signer) → txHash
```

- `approve` handles USDT special case: reset to 0 first, then approve target amount.
- Token addresses and decimals read from `config.yaml`.

### `lib/config.js` — Configuration

Reads and merges:
- `~/.aurehub/.env` (environment variables)
- `~/.aurehub/config.yaml` (structured config: wallet_mode, tokens, contracts, risk params)

## Setup Changes

### Wallet Mode Selection

New step added at the beginning of `setup.sh`:

```
=== Wallet Mode ===
[1] WDK (recommended) — seed-phrase based, no external tools needed
[2] Foundry (advanced) — requires Foundry installed, keystore-based

Select [1]:
```

Default: WDK (press Enter). Result written to `~/.aurehub/config.yaml` as `wallet_mode: wdk|foundry`.

### WDK Setup Flow (after selecting WDK)

1. Check Node.js >= 18.
2. Run `node market/lib/create-wallet.js` → generates BIP-39 mnemonic.
3. Save to `~/.aurehub/.wdk_seed` (chmod 600).
4. Display derived address.
5. Write `ETH_RPC_URL` to `~/.aurehub/.env`.
6. Skip all Foundry steps.

### Foundry Setup Flow (after selecting Foundry)

Identical to current setup.sh flow (install Foundry → keystore → password file).

## Backward Compatibility

- **`wallet_mode` not set in config.yaml** → agent detects missing field, instructs user to re-run setup. No default mode inference.
- **`limit-order.js`** → completely unchanged. Continues using ethers v5 + `cast wallet sign`.
- **ethers v5/v6 coexistence** → separate `node_modules` directories (`scripts/package.json` for v5, `scripts/market/package.json` for v6). No conflict.

## SKILL.md Changes

1. **Environment check** adds `wallet_mode` detection:
   - WDK mode: check seed file + Node.js >= 18
   - Foundry mode: check keystore + password file
   - Both modes require Node.js (market module dependency)

2. **Trade instructions** migrate from `cast` to `node swap.js`:
   - Quote: `cast call QuoterV2...` → `node market/swap.js quote --side buy --amount 100`
   - Balance: `cast call token balanceOf...` → `node market/swap.js balance`
   - Approve: `cast send token approve...` → `node market/swap.js approve --token USDT --amount 1000`
   - Swap: `cast send router multicall...` → `node market/swap.js swap --side buy --amount 100 --min-out 0.03`

3. **`cast` residual uses**: Only in Foundry mode for `cast wallet list` (view wallets) and `cast --version` (env check). WDK mode has zero `cast` dependency.

## Reference File Changes

| File | Change |
|------|--------|
| `onboarding.md` | Add wallet mode selection branch |
| `balance.md` | `cast call` → `node swap.js balance` |
| `quote.md` | `cast call QuoterV2` → `node swap.js quote` |
| `buy.md` | Full rewrite: `cast send` → `node swap.js approve` + `node swap.js swap` |
| `sell.md` | Full rewrite: same as buy.md |
| `limit-order-*.md` | No change |
| `live-trading-runbook.md` | Update tool descriptions |
| `wallet-modes.md` (NEW) | Comparison of WDK vs Foundry for agent reference |

## Safety Invariants (Unchanged)

- Confirmation thresholds: <$10 no confirm, $10-$1000 single, >$1000 double
- Slippage >50bps → double confirmation
- Insufficient balance / ETH for gas → hard-stop
- XAUT precision >6 decimals → hard-stop
- USDT approve must reset to 0 first
- Private keys never written to disk, logs, or stdout
- Seed file and password file: chmod 600

## Dependencies

### `market/package.json`

```json
{
  "name": "xaut-trade-market",
  "private": true,
  "type": "module",
  "dependencies": {
    "ethers": "^6",
    "@uniswap/v3-sdk": "^3",
    "@uniswap/sdk-core": "^6",
    "js-yaml": "^4"
  }
}
```

### Existing `scripts/package.json` (unchanged)

```json
{
  "dependencies": {
    "@uniswap/uniswapx-sdk": "^2.0.0",
    "ethers": "^5.7.2"
  }
}
```
