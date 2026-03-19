# hyperliquid-trade

Trade spot and perpetual futures on [Hyperliquid](https://hyperliquid.xyz) directly from your AI coding assistant.

## Prerequisites

- Node.js >= 20.19.0
- An aurehub WDK wallet (shared with xaut-trade) **or** a Foundry keystore
- USDC deposited on Hyperliquid (via [app.hyperliquid.xyz](https://app.hyperliquid.xyz))

## Installation

```bash
npx skills add aurehub/skills
# Select hyperliquid-trade in the prompt
```

## First-time setup

Say to your AI assistant:

> "Set up my Hyperliquid wallet"

The assistant will guide you through wallet configuration and creating `~/.aurehub/hyperliquid.yaml`.

If you already use xaut-trade, your WDK wallet is shared — no additional wallet setup needed.

## Usage examples

```
Buy 0.1 ETH spot
Sell 50 USDC worth of BTC
Open long ETH 0.1 with 5x leverage cross margin
Short BTC 0.01 with 10x isolated margin
Close my ETH position
Check my Hyperliquid balance
```

## Configuration

`~/.aurehub/hyperliquid.yaml` (auto-created from template):

```yaml
network: mainnet
api_url: https://api.hyperliquid.xyz

risk:
  confirm_trade_usd: 100   # trades below this execute without prompting
  large_trade_usd: 1000    # trades at or above this require double confirmation
  leverage_warn: 20        # leverage at or above this shows an extra warning
```

## Security

- Private key never stored in plaintext — WDK vault uses PBKDF2 + XSalsa20-Poly1305 encryption
- Every trade requires explicit confirmation
- Runtime `PRIVATE_KEY` environment variable is rejected
