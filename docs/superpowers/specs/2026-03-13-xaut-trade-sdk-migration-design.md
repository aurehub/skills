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
│  create/import   │     │  encrypted seed  │
└────────┬────────┘     └────────┬────────┘
         │ decrypt keystore       │ decrypt vault → derive mnemonic
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

| Subcommand  | Calls | Requires Signer |
|-------------|-------|-----------------|
| `quote`     | `uniswap.quote()` | No (provider only) |
| `balance`   | `erc20.getBalance()` | No |
| `allowance` | `erc20.getAllowance()` | No |
| `approve`   | `erc20.approve()` | Yes |
| `swap`      | `uniswap.buildSwap()` → `signer.sendTransaction()` | Yes |
| `address`   | `signer.address` | Yes (loads wallet to derive address) |

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
- Read encrypted vault from `~/.aurehub/.wdk_vault` (contains `encryptedEntropy` + `salt` as JSON)
- Read password from `WDK_PASSWORD_FILE` (default `~/.aurehub/.wdk_password`)
- Decrypt entropy via `@tetherto/wdk-secret-manager`:
  ```
  sm = new WdkSecretManager(password, salt, { iterations: 100_000 })
  entropy = sm.decrypt(encryptedEntropy)
  mnemonic = sm.entropyToMnemonic(entropy)
  ```
- `ethers.Wallet.fromPhrase(mnemonic).connect(provider)`
- `sm.dispose()` to wipe sensitive data from memory

Passwords, mnemonics, and entropy are held in memory only during decryption, not cached. The seed never exists as plaintext on disk.

### `lib/provider.js` — RPC Provider with Fallback

```javascript
async function createProvider() → FallbackProvider (custom wrapper)
```

Returns a custom `FallbackProvider` that wraps `ethers.JsonRpcProvider` with automatic retry logic:

- Primary: `ETH_RPC_URL` from `~/.aurehub/.env`
- Fallback list: `ETH_RPC_URL_FALLBACK` (comma-separated)
- On RPC error (429, 502, 503, timeout, rate limit), catches the error and retries with the next URL in the fallback list
- Session-sticky: once a fallback URL succeeds, it becomes the primary for all subsequent calls within the process
- Exposes the same interface as `ethers.JsonRpcProvider` (proxies `send`, `call`, `getBlock`, etc.) so callers are unaware of fallback logic
- If all URLs exhausted → throw with list of attempted URLs and their errors

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
- `~/.aurehub/.env` (environment variables, parsed manually — split on `=`, ignore comments/blanks)
- `~/.aurehub/config.yaml` (structured config: wallet_mode, tokens, contracts, risk params)

Token symbols (e.g., `USDT`, `XAUT`) are resolved to addresses and decimals via `config.yaml` `tokens` section. CLI subcommands accept `--token USDT` (symbol) which `config.js` resolves.

### `lib/create-wallet.js` — WDK Encrypted Wallet Creation

```javascript
// Called by setup.sh: node market/lib/create-wallet.js --password-file <path> [--vault-file <path>]
// Outputs JSON to stdout: { address, vaultFile }
```

Uses `@tetherto/wdk-secret-manager` for encrypted seed management. The seed never touches disk as plaintext.

- Read password from `--password-file` (must be ≥12 characters).
- Generate random salt via `WdkSecretManager.generateSalt()`.
- Create `WdkSecretManager(password, salt, { iterations: 100_000 })`.
- Call `sm.generateAndEncrypt()` → `{ encryptedSeed, encryptedEntropy }`.
- Decrypt entropy temporarily to derive address: `entropy → mnemonic → ethers.Wallet.fromPhrase() → address`.
- Write `{ encryptedEntropy, salt }` as JSON to `--vault-file` (default `~/.aurehub/.wdk_vault`), chmod 600.
- Call `sm.dispose()` to wipe sensitive memory.
- Output `{ address, vaultFile }` as JSON to stdout.
- If vault file already exists → error with message "vault file already exists, use --force to overwrite".
- Does NOT display mnemonic or entropy in stdout (security).

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
2. Prompt user for wallet password (≥12 characters), write to `~/.aurehub/.wdk_password` (chmod 600).
3. Run `node market/lib/create-wallet.js --password-file ~/.aurehub/.wdk_password` → generates encrypted vault.
4. Encrypted vault saved to `~/.aurehub/.wdk_vault` (chmod 600). Seed never written as plaintext.
5. Display derived address.
6. Write `ETH_RPC_URL` and `WDK_PASSWORD_FILE=~/.aurehub/.wdk_password` to `~/.aurehub/.env`.
7. Skip all Foundry steps.

### Foundry Setup Flow (after selecting Foundry)

Identical to current setup.sh flow (install Foundry → keystore → password file).

## Backward Compatibility

- **`wallet_mode` not set in config.yaml** → agent detects missing field, instructs user to re-run setup. No default mode inference.
- **`limit-order.js`** → completely unchanged. Continues using ethers v5 + `cast wallet sign`.
- **ethers v5/v6 coexistence** → separate `node_modules` directories (`scripts/package.json` for v5, `scripts/market/package.json` for v6). No conflict.

## SKILL.md Changes

1. **Environment check** adds `wallet_mode` detection:
   - WDK mode: check vault file + password file + Node.js >= 18
   - Foundry mode: check keystore + password file
   - Both modes require Node.js (market module dependency)

2. **Trade instructions** migrate from `cast` to `node swap.js`:
   - Quote: `cast call QuoterV2...` → `node market/swap.js quote --side buy --amount 100`
   - Balance: `cast call token balanceOf...` → `node market/swap.js balance`
   - Approve: `cast send token approve...` → `node market/swap.js approve --token USDT --amount 1000`
   - Swap: `cast send router multicall...` → `node market/swap.js swap --side buy --amount 100 --min-out 0.03`

3. **Wallet address derivation**: `cast wallet address ...` → `node market/swap.js address`. Used for balance checks, post-trade registration, and display. Works in both wallet modes.

4. **`cast` residual uses**: Only in Foundry mode for `cast wallet list` (view wallets) and `cast --version` (env check). WDK mode has zero `cast` dependency.

## Reference File Changes

| File | Change |
|------|--------|
| `onboarding.md` | Add wallet mode selection branch |
| `balance.md` | `cast call` → `node swap.js balance` |
| `quote.md` | `cast call QuoterV2` → `node swap.js quote` |
| `buy.md` | Full rewrite: `cast send` → `node swap.js approve` + `node swap.js swap` |
| `sell.md` | Full rewrite: same pattern as buy.md with direction-specific adjustments (XAUT→USDT, precision check, no approve reset) |
| `limit-order-*.md` | No change |
| `live-trading-runbook.md` | Update tool descriptions |
| `wallet-modes.md` (NEW) | Comparison of WDK vs Foundry for agent reference |

## Safety Invariants (Unchanged)

- Confirmation thresholds: <$10 no confirm, $10-$1000 single, >$1000 double
- Slippage >50bps → double confirmation
- Insufficient balance / ETH for gas → hard-stop
- XAUT precision >6 decimals → hard-stop
- USDT approve must reset to 0 first
- Private keys and seed phrases never written to disk as plaintext, logs, or stdout
- WDK vault uses `@tetherto/wdk-secret-manager` (PBKDF2 encryption, 100k iterations) — only encrypted entropy + salt stored on disk
- All sensitive files (vault, password, keystore) chmod 600

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
    "@tetherto/wdk-secret-manager": "^1",
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
