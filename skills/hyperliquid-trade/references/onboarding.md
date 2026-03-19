# Onboarding

## Step 1: Choose wallet mode

> **[1] WDK (recommended)** — seed-phrase based, encrypted vault, no external tools
> **[2] Foundry** — requires Foundry installed, keystore-based

Default to WDK if user just presses enter.

## Step 2: WDK setup

Check if vault already exists:
```bash
ls ~/.aurehub/.wdk_vault 2>/dev/null && echo EXISTS || echo NOT_FOUND
```

If EXISTS: inform user, switch `WALLET_MODE=wdk` in `.env` if needed, and stop.

If NOT_FOUND: WDK setup requires the user's existing WDK vault from another aurehub skill. Check if xaut-trade is installed:

```bash
find "$HOME" -maxdepth 6 -path "*/xaut-trade/scripts/setup.sh" 2>/dev/null | head -1
```

If found: run `bash <path>/setup.sh` and follow the prompts.
If not found: instruct user to install xaut-trade first (`npx skills add aurehub/skills`) to create the shared WDK vault, then return here.

After setup: update `WALLET_MODE=wdk` in `~/.aurehub/.env`.

**Security reminder after WDK setup:**
> **Back up your seed phrase** — run `node <xaut-trade-scripts-dir>/lib/export-seed.js` in a private terminal. Write down the 12 words and store offline. Never share them.

## Step 3: Foundry setup

```bash
cast --version  # must succeed
cast wallet list  # confirm account exists
```

Set in `~/.aurehub/.env`:
```
WALLET_MODE=foundry
FOUNDRY_ACCOUNT=<your-account-name>
KEYSTORE_PASSWORD_FILE=~/.aurehub/.wallet.password
```

## Step 4: Configure hyperliquid.yaml

```bash
cp <skill-dir>/config.example.yaml ~/.aurehub/hyperliquid.yaml
```

Edit `~/.aurehub/hyperliquid.yaml` if needed (defaults work for mainnet).

## Step 5: Fund your account

Hyperliquid requires USDC deposited via the bridge before trading.

1. Visit https://app.hyperliquid.xyz
2. Connect your wallet (same address as WDK/Foundry — check with `balance.js address`)
3. Deposit USDC from Arbitrum

For perps, deposit goes to your perp margin account. For spot, swap or transfer USDC to the spot account.

## Step 6: Verify

```bash
node <scripts-dir>/balance.js address
node <scripts-dir>/balance.js spot
```

Expected: address JSON and spot balances including USDC.
