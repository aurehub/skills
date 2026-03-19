# Onboarding

hyperliquid-trade uses the WDK wallet shared with xaut-trade. No separate wallet creation needed.

## Step 1: Ensure xaut-trade wallet is set up

Check if the vault exists:
```bash
ls ~/.aurehub/.wdk_vault 2>/dev/null && echo EXISTS || echo NOT_FOUND
ls ~/.aurehub/.wdk_password 2>/dev/null && echo EXISTS || echo NOT_FOUND
```

If either is NOT_FOUND: xaut-trade must be installed and its wallet setup completed first.

```bash
npx skills add aurehub/skills   # select xaut-trade
```

Then follow xaut-trade's wallet setup, and return here.

## Step 2: Configure hyperliquid.yaml

```bash
cp <skill-dir>/config.example.yaml ~/.aurehub/hyperliquid.yaml
```

Edit `~/.aurehub/hyperliquid.yaml` if needed (defaults work for mainnet):

```yaml
network: mainnet
api_url: https://api.hyperliquid.xyz

risk:
  confirm_trade_usd: 100    # below: execute without prompting
  large_trade_usd: 1000     # at or above: double confirmation required
  leverage_warn: 20         # at or above: extra warning before open
```

## Step 3: Fund your Hyperliquid account

Your wallet address on Hyperliquid is the same EVM address as your WDK wallet. Check it:

```bash
node <scripts-dir>/balance.js address
```

Deposit USDC at [app.hyperliquid.xyz](https://app.hyperliquid.xyz):
1. Connect your wallet (same address shown above)
2. Deposit USDC from Arbitrum to your Hyperliquid account
3. For spot trading, USDC lands in your spot account; for perps, it goes to your perp margin account

## Step 4: Verify

```bash
node <scripts-dir>/balance.js address
node <scripts-dir>/balance.js spot
```

Expected: address JSON and spot balances including USDC.
