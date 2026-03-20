---
name: hyperliquid-trade
description: "Trade on Hyperliquid — spot and perpetual futures. Supports market orders (IOC), leverage setting, and WDK wallet. Triggers: buy ETH spot, sell BTC, long ETH, short BTC, open long, open short, close position, perp trade, check balance, Hyperliquid positions."
license: MIT
compatibility: "Requires Node.js >= 20.19.0"
metadata:
  author: aurehub
  version: "1.0.0"
---

# hyperliquid-trade

Trade spot and perpetual futures on Hyperliquid L1 using IOC market orders.

## When to Use

- **Spot**: buy or sell any token listed on Hyperliquid spot markets
- **Perps**: open long/short or close perpetual futures positions
- **Balance**: check spot token balances or perp positions and margin

## External Communications

This skill connects to the Hyperliquid API (`api_url` in `hyperliquid.yaml`, default `https://api.hyperliquid.xyz`). Inform the user before the first external call in each session. On first setup, installs dependencies via `npm install`.

## Environment & Security Declaration

### Required config files

| File | Purpose |
|------|---------|
| `~/.aurehub/.wdk_vault` | WDK encrypted vault (created by xaut-trade setup) |
| `~/.aurehub/.wdk_password` | Vault password (mode 0600, created by xaut-trade setup) |
| `~/.aurehub/hyperliquid.yaml` | Network, API URL, risk thresholds |

### Security safeguards

- Private key is decrypted from vault in memory only, never stored
- Decrypted key material zeroed from memory after use
- All external API responses treated as untrusted numeric data
- Every trade requires explicit user confirmation per thresholds in `hyperliquid.yaml`

## Environment Readiness Check (run first on every session)

`<skill-dir>` = directory containing this SKILL.md.
`<scripts-dir>` = `<skill-dir>/scripts`.

Run these checks before handling any intent (except knowledge queries):

| Step | Check | Type | Action |
|------|-------|------|--------|
| 1 | `~/.aurehub/.wdk_vault` exists | HARD STOP | Load [references/onboarding.md](references/onboarding.md) and guide the user through setup. |
| 2 | `~/.aurehub/.wdk_password` exists | HARD STOP | Load [references/onboarding.md](references/onboarding.md) and guide the user through setup. |
| 3 | `~/.aurehub/hyperliquid.yaml` exists | AUTO-FIX | `cp <skill-dir>/config.example.yaml ~/.aurehub/hyperliquid.yaml` |
| 4 | `node -e "if(+process.version.slice(1).split('.')[0]<20)process.exit(1)"` passes | HARD STOP | "Node.js >= 20.19.0 is required. Please upgrade." |
| 5 | `<scripts-dir>/node_modules` exists | AUTO-FIX | `cd <scripts-dir> && npm install` |
| 6 | `node <scripts-dir>/balance.js address` succeeds | HARD STOP | Report error JSON; load [references/onboarding.md](references/onboarding.md) |

If all pass: proceed to intent detection.

## Intent Detection

| User says | Action |
|-----------|--------|
| buy ETH / purchase BTC / spot buy | `trade.js spot buy` |
| sell SOL / spot sell ETH | `trade.js spot sell` |
| long ETH / open long BTC 10x / go long | `trade.js perp open ... long` |
| short BTC / open short ETH / go short | `trade.js perp open ... short` |
| close position / close ETH / flat / exit | `trade.js perp close` (auto-detects direction) |
| balance / holdings / positions / how much | `balance.js spot` + `balance.js perp` |
| setup / onboarding / first time | Load [references/onboarding.md](references/onboarding.md) |
| Insufficient info (no coin or amount) | Ask for the missing details before proceeding |

## Resolving SCRIPTS_DIR

Use `<skill-dir>/scripts` as the scripts directory. To find `<skill-dir>` at runtime:

```bash
# 1. Git repo fallback
GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -n "$GIT_ROOT" ] && [ -d "$GIT_ROOT/skills/hyperliquid-trade/scripts" ] && SCRIPTS_DIR="$GIT_ROOT/skills/hyperliquid-trade/scripts"
# 2. Bounded home search
[ -z "$SCRIPTS_DIR" ] && SCRIPTS_DIR=$(dirname "$(find "$HOME" -maxdepth 6 -type f -path "*/hyperliquid-trade/scripts/balance.js" 2>/dev/null | head -1)")
echo "$SCRIPTS_DIR"
```

## Balance Flow

Load [references/balance.md](references/balance.md) for the full flow.

```bash
node "$SCRIPTS_DIR/balance.js" spot
node "$SCRIPTS_DIR/balance.js" perp
```

Parse the JSON output and present balances in a human-readable table.

## Spot Trade Flow

Load [references/spot-trade.md](references/spot-trade.md) for the full flow.

1. Confirm intent: coin, direction (buy/sell), size
2. Run balance check to verify sufficient USDC/token
3. Show trade preview (see format below) and get confirmation
4. Execute: `node "$SCRIPTS_DIR/trade.js" spot <buy|sell> <COIN> <SIZE>`
5. Parse JSON result and report fill price and outcome

## Perp Trade Flow

Load [references/perp-trade.md](references/perp-trade.md) for the full flow.

**Open position:**
1. Confirm intent: coin, direction (long/short), size, leverage, margin mode
2. Show trade preview and get confirmation (double if `≥ large_trade_usd` margin)
3. Execute: `node "$SCRIPTS_DIR/trade.js" perp open <COIN> <long|short> <SIZE> --leverage <N> --<cross|isolated>`

**Close position:**
1. Show current position from `balance.js perp`
2. Confirm size to close
3. Execute: `node "$SCRIPTS_DIR/trade.js" perp close <COIN> <SIZE>`

## Confirmation Thresholds

Thresholds are read from `~/.aurehub/hyperliquid.yaml`. Defaults: `confirm_trade_usd=100`, `large_trade_usd=1000`, `leverage_warn=20`.

For **spot**: threshold applies to trade value (size × est. price).
For **perps**: threshold applies to margin deposited (size × est. price ÷ leverage).

```
< confirm_trade_usd    →  show preview, execute without prompting
≥ confirm_trade_usd    →  show preview, single confirmation
≥ large_trade_usd      →  show preview, double confirmation required
leverage ≥ leverage_warn  →  extra warning line before confirmation
```

Trade preview format:
```
Action:      <Open Long ETH (Perpetual) | Buy ETH (Spot)>
Size:        <0.1 ETH>
Leverage:    <10x Cross>           ← perp only
Est. price:  ~$<3,200>  (IOC, 5% slippage budget)
Margin used: ~$<320> USDC         ← perp only
Trade value: ~$<320> USDC         ← spot only
Confirm? [y/N]
```

## Hard Stops

| Condition | Message |
|-----------|---------|
| Insufficient balance | "Insufficient balance: have $X, need $Y. Deposit at app.hyperliquid.xyz to top up." |
| Asset not found | "Asset X not found on Hyperliquid. Check the symbol and try again." |
| Leverage exceeds asset max | "Max leverage for ETH is Nx. Requested: Mx." |
| No open position (close) | "No open position found for ETH." |
| IOC order not filled | "Order not filled — price moved beyond the 5% IOC limit. Check current price and retry." |
| Node.js < 20.19 | "Node.js >= 20.19.0 required. Please upgrade: https://nodejs.org" |
| API unreachable | "Hyperliquid API unreachable. Check network or `api_url` in `~/.aurehub/hyperliquid.yaml`." |
