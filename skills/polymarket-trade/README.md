# polymarket-trade

Trade on Polymarket prediction markets on Polygon. Non-custodial — private key stays in your WDK vault.

## Prerequisites

- Node.js 18+
- A WDK wallet vault (`~/.aurehub/.wdk_vault`) — set up via the `xaut-trade` skill
- Polygon RPC URL (e.g. from Alchemy, Infura, or a public endpoint)
- POL for gas (>= 0.01 POL) and USDC.e for trading

## Installation

```bash
npx skills add aurehub/skills
# Select: polymarket-trade
```

## Initial Setup

### 1. Configure `~/.aurehub/.env`

```
POLYGON_RPC_URL=https://polygon-rpc.com
```

### 2. Configure `~/.aurehub/polymarket.yaml`

```bash
cp <skill-dir>/config.example.yaml ~/.aurehub/polymarket.yaml
```

Edit the file and set `rpc_env: POLYGON_RPC_URL` (or whatever env var name you used).

### 3. Derive CLOB credentials

```bash
cd skills/polymarket-trade/scripts
npm install
node setup.js
```

This signs an EIP-712 message to derive API credentials from your wallet and saves them to `~/.aurehub/.polymarket_clob`.

## Usage

### Browse markets

```bash
node scripts/browse.js "bitcoin 100k"
node scripts/browse.js "will trump"
```

### Check balance

```bash
node scripts/balance.js
```

### Buy shares

```bash
node scripts/trade.js --buy --market bitcoin-100k-2025 --side YES --amount 25
```

### Sell shares

```bash
node scripts/trade.js --sell --market bitcoin-100k-2025 --side YES --amount 10
```

## Geo-restriction

Polymarket blocks users in the US and some other regions. If you see a **403 Forbidden** error, enable a VPN and retry.

## Safety Gates

| Amount | Action |
|--------|--------|
| < $50 | Proceeds automatically |
| $50-$499 | Single confirmation required |
| >= $500 | Double confirmation required |

Hard-stops: insufficient USDC.e, POL gas < 0.01, market CLOSED, amount below minimum order size.

## Troubleshooting

- **"Missing ~/.aurehub/.env"** — run: `cp <skill-dir>/.env.example ~/.aurehub/.env`
- **"POLYGON_RPC_URL not set"** — add it to `~/.aurehub/.env` and update `rpc_env` in `polymarket.yaml`
- **"Run: node scripts/setup.js"** — CLOB credentials not derived yet; run setup
- **"node_modules not found"** — run `npm install` in the scripts directory
- **"decryption failed"** — wrong password in `~/.aurehub/.wdk_password`
