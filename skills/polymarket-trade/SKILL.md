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
  version: "1.0.0"
---

# polymarket-trade

Trade on Polymarket prediction markets. Non-custodial — private key stays in your WDK vault.

## Prerequisites

Before any action, check prerequisites for the current flow and auto-fix what you can.

**Browse flow** (no wallet or CLOB needed): check steps 3–4 only.
**Balance / Trade / Setup flow**: check all steps 1–6 in order.

| Step | Missing item | Agent action |
|------|---|---|
| 1 | `~/.aurehub/.wdk_vault` | Inform: must be created via xaut-trade setup first. Stop. |
| 2 | `~/.aurehub/.wdk_password` | Inform: must be created via xaut-trade setup first. Stop. |
| 3 | `~/.aurehub/.env` missing | Run: `cp <skill-dir>/.env.example ~/.aurehub/.env` |
| 3 | `~/.aurehub/.env` exists, `POLYGON_RPC_URL` absent | Append `POLYGON_RPC_URL=https://polygon-rpc.com` to `~/.aurehub/.env` |
| 4 | `~/.aurehub/polymarket.yaml` missing | Run: `cp <skill-dir>/config.example.yaml ~/.aurehub/polymarket.yaml` |
| 5 | `node_modules` missing in `<skill-dir>/scripts/` | Run: `npm install` in `<skill-dir>/scripts/` |
| 6 | `~/.aurehub/.polymarket_clob` missing | Run: `node <skill-dir>/scripts/setup.js` (only after steps 3–5 pass) |

On any auto-fix failure: stop and report the error with the manual remediation command.
After all fixes succeed, re-run the relevant checks and proceed.

`<skill-dir>` is the directory containing this SKILL.md file.

## Intent Detection

| User says | Action |
|-----------|--------|
| "buy YES on X market", "buy X at Y price", "buy shares" | buy flow |
| "sell my YES shares", "sell X shares" | sell flow |
| "browse X", "what markets", "what are the odds on X" | browse flow |
| "my polymarket balance", "how much USDC" | balance flow |

## Browse Flow

Run environment check (no wallet, no RPC, no CLOB credentials needed):
```
node scripts/browse.js "<keyword or market slug>"
```
Show the output to the user. Token IDs from this output are used for buy/sell.

## Balance Flow

Run environment check:
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
- Insufficient USDC.e (buy): auto-swap POL→USDC.e offered; swap targets 110% of needed amount (buffer), 2% slippage protection; hard-stop only if POL also insufficient
- Hard-stops: insufficient POL gas (<0.01), market CLOSED, amount < min_order_size, CTF balance insufficient (sell)

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
