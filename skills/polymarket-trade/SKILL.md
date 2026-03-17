---
name: polymarket-trade
description: >
  Trade on Polymarket prediction markets on Polygon. Supports browsing markets,
  checking wallet/CLOB balance, and buying or selling YES/NO shares with safety gates.
  Wallet: WDK vault (~/.aurehub/.wdk_vault). Config: ~/.aurehub/polymarket.yaml.
  Triggers: buy YES, buy NO, sell shares, browse markets, check Polymarket balance,
  Polymarket trade, prediction market, what are the odds.
license: MIT
metadata:
  author: aurehub
  version: "1.0"
---

# polymarket-trade

Trade on Polymarket prediction markets. Non-custodial — private key stays in your WDK vault.

## Prerequisites

Before any action, verify the environment:
1. `~/.aurehub/.env` exists with `WALLET_MODE=wdk`
2. `~/.aurehub/.wdk_vault` exists
3. `~/.aurehub/.wdk_password` exists
4. `~/.aurehub/polymarket.yaml` exists (copy from `config.example.yaml`)
5. `POLYGON_RPC_URL` set in `.env` (check via `rpc_env` field in yaml)

If any check fails, tell the user what's missing and how to fix it before proceeding.

For setup and CLOB credential derivation: `node scripts/setup.js`

## Intent Detection

| User says | Action |
|-----------|--------|
| "buy YES on X market", "buy X at Y price", "buy shares" | buy flow |
| "sell my YES shares", "sell X shares" | sell flow |
| "browse X", "what markets", "what are the odds on X" | browse flow |
| "my polymarket balance", "how much USDC" | balance flow |

## Browse Flow

Run environment check (steps 1, 4 — no wallet, no RPC, no CLOB credentials needed):
```
node scripts/browse.js "<keyword or market slug>"
```
Show the output to the user. Token IDs from this output are used for buy/sell.

## Balance Flow

Run environment check (steps 1-5):
```
node scripts/balance.js
```

## Buy Flow

1. Run `node scripts/browse.js <market>` to show current prices
2. Ask user: market slug, side (YES/NO), amount in USD
3. Run: `node scripts/trade.js --buy --market <slug> --side YES|NO --amount <usd>`
4. The script handles approval and order submission; report the result

## Sell Flow

1. Run `node scripts/browse.js <market>` to confirm token IDs and current bids
2. Ask user: market slug, side (YES/NO to sell), number of shares
3. Run: `node scripts/trade.js --sell --market <slug> --side YES|NO --amount <shares>`
4. The script handles setApprovalForAll and order submission; report the result

## Safety Gates (handled by trade.js)

- Amount < $50: proceeds automatically
- $50 ≤ amount < $500: shows risk summary, prompts once
- Amount ≥ $500: double confirmation required
- Hard-stops: insufficient USDC.e, insufficient POL gas (<0.01), market CLOSED, amount < min_order_size, CTF balance insufficient (sell)

## Geo-restriction

Polymarket API blocks US and some other regions. If you see a 403 error, tell the user to enable a VPN and retry.

## References

Load these on demand:
- `references/setup.md` — first-time setup guide
- `references/buy.md` — detailed buy flow
- `references/sell.md` — detailed sell flow
- `references/balance.md` — balance interpretation
- `references/browse.md` — browse output format
- `references/contracts.md` — Polygon contract addresses
- `references/safety.md` — safety gate details
