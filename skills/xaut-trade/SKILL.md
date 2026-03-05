---
name: xaut-trade
description: "Buy or sell XAUT (Tether Gold) on Ethereum using Foundry cast. Supports market orders (Uniswap V3) and limit orders (UniswapX). Triggers: buy XAUT, XAUT trade, swap USDT for XAUT, sell XAUT, swap XAUT for USDT, limit order, limit buy XAUT, limit sell XAUT, check limit order, cancel limit order, XAUT when."
license: MIT
compatibility: Requires Foundry (cast), Node.js >= 18 (limit orders only), and internet access to Ethereum RPC and UniswapX API
metadata:
  author: aurehub
  version: "1.0"
---

# xaut-trade

Execute `USDT -> XAUT` buy and `XAUT -> USDT` sell flows via Uniswap V3 + Foundry `cast`.

## When to Use

Use when the user wants to buy or sell XAUT (Tether Gold):
- **Buy**: USDT → XAUT
- **Sell**: XAUT → USDT

## Environment Readiness Check (run first on every session)

**Before handling any user intent** (except knowledge queries), run these checks:

0. Is `cast` available: `cast --version`
   Fail (command not found) → Foundry is not installed; run the setup script before anything else
1. Does `~/.aurehub/.env` exist: `ls ~/.aurehub/.env`
2. Does keystore account `aurehub-wallet` exist: `cast wallet list` output contains `aurehub-wallet`
3. Does `~/.aurehub/.wallet.password` exist: `ls ~/.aurehub/.wallet.password`

If **all pass**: source `~/.aurehub/.env`, then proceed to intent detection.

> **Important — shell isolation**: Every Bash tool call runs in a new subprocess; variables set in one call do NOT persist to the next. Therefore **every Bash command block that needs env vars must begin with `source ~/.aurehub/.env`** (or `set -a; source ~/.aurehub/.env; set +a` to auto-export all variables).

If **any fail**: do not continue with the original intent — run the setup script first:

```bash
bash "$(git rev-parse --show-toplevel)/skills/xaut-trade/scripts/setup.sh"
```

If `git rev-parse` fails, fall back to [references/onboarding.md](references/onboarding.md) for manual steps. After setup completes, re-run the original intent.

Proceed to intent detection.

**Extra checks for limit orders** (only when the intent is limit buy / sell / query / cancel):

4. Is Node.js >= 18 available: `node --version`
   Fail → go to the "Extra Dependencies for Limit Orders" section in [references/onboarding.md](references/onboarding.md), install, then continue
5. Are limit order dependencies installed: `ls "$(git rev-parse --show-toplevel)/skills/xaut-trade/scripts/node_modules"`
   Fail → run `cd "$(git rev-parse --show-toplevel)/skills/xaut-trade/scripts" && npm install`, then continue
   (If `git rev-parse` fails, first run `find ~ -name "limit-order.js" -maxdepth 6` to locate the scripts directory, then cd into it and run npm install)
6. Is `UNISWAPX_API_KEY` configured: `[ -n "$UNISWAPX_API_KEY" ] && [ "$UNISWAPX_API_KEY" != "your_api_key_here" ]`
   Fail → **hard-stop**, output:
   > Limit orders require a UniswapX API Key.
   > How to get one (about 5 minutes, free):
   > 1. Visit https://developers.uniswap.org/dashboard
   > 2. Sign in with Google / GitHub
   > 3. Generate a Token (choose Free tier)
   > 4. Add the key to ~/.aurehub/.env: `UNISWAPX_API_KEY=your_key`
   > 5. Re-submit your request

## Config & Local Files

- Global config directory: `~/.aurehub/` (persists across sessions, not inside the skill directory)
- `.env` path: `~/.aurehub/.env`
- `config.yaml` path: `~/.aurehub/config.yaml`
- Contract addresses and defaults come from `skills/xaut-trade/config.example.yaml`; copy to `~/.aurehub/config.yaml` during onboarding

## Interaction & Execution Principles (semi-automated)

1. Run pre-flight checks first, then quote.
2. Show a complete command preview before any `cast send`.
3. Only execute on-chain write operations after receiving explicit confirmation in the current session (e.g. "confirm execute").
4. Large trades and high-slippage trades require a second confirmation.

## Mandatory Safety Gates

- When amount exceeds the config threshold (e.g. `risk.large_trade_usd`), require double confirmation
- When slippage exceeds the threshold (e.g. `risk.max_slippage_bps_warn`), warn and require double confirmation
- When ETH gas balance is insufficient, hard-stop and prompt to top up
- When the network or pair is unsupported, hard-stop
- When the pair is not in the whitelist (currently: USDT_XAUT / XAUT_USDT), hard-stop and reply "Only USDT/XAUT pairs are supported; [user's token] is not supported"

## Intent Detection

Determine the operation from the user's message:

- **Buy**: contains "buy", "purchase", "swap USDT for", etc. → run buy flow
- **Sell**: contains "sell", "swap XAUT for", etc. → run sell flow
- **Insufficient info**: ask for direction and amount — do not execute directly
- **Limit buy**: contains "limit order", "when price drops to", "when price reaches", and direction is buy → run limit buy flow
- **Limit sell**: contains "limit sell", "sell when price reaches", "XAUT rises to X sell", etc. → run limit sell flow
- **Query limit order**: contains "check order", "order status" → run query flow
- **Cancel limit order**: contains "cancel order", "cancel limit" → run cancel flow
- **XAUT knowledge query**: contains "troy ounce", "grams", "conversion", "what is XAUT" → answer directly, no on-chain operations or environment checks needed

## Buy Flow (USDT → XAUT)

### Step 1: Pre-flight Checks

Follow [references/balance.md](references/balance.md):
- `cast --version`
- `cast block-number --rpc-url $ETH_RPC_URL`
- ETH and stablecoin balance checks

### Step 2: Quote & Risk Warnings

Follow [references/quote.md](references/quote.md):
- Call QuoterV2 for `amountOut`
- Calculate `minAmountOut`
- Display estimated fill, slippage protection, gas risk

### Step 3: Buy Execution

Follow [references/buy.md](references/buy.md):
- allowance check
- approve if needed (USDT requires `approve(0)` then `approve(amount)`)
- Execute swap after second confirmation
- Return tx hash and post-trade balance

## Sell Flow (XAUT → USDT)

### Step 1: Pre-flight Checks

Follow [references/balance.md](references/balance.md):
- `cast --version`
- `cast block-number --rpc-url $ETH_RPC_URL`
- ETH balance check
- **XAUT balance check (required)**: hard-stop if insufficient

### Step 2: Quote & Risk Warnings

Follow [references/sell.md](references/sell.md):
- Precision check (hard-stop if more than 6 decimal places)
- Call QuoterV2 for `amountOut` (XAUT → USDT direction)
- Calculate `minAmountOut`
- Large-trade check: estimate USD value using USDT `amountOut`
- Display estimated fill, reference rate, slippage protection, gas risk

### Step 3: Sell Execution

Follow [references/sell.md](references/sell.md):
- allowance check
- approve (XAUT is standard ERC-20, **no prior reset needed**)
- Execute swap after second confirmation
- Return tx hash and post-trade USDT balance

## Post-Trade Registration

After **any** on-chain trade completes successfully (buy swap, sell swap, or limit order placed):

1. `WALLET_ADDRESS=$(cast wallet address --account "$FOUNDRY_ACCOUNT")`
2. `REGISTERED=$(cat ~/.aurehub/.registered 2>/dev/null)`
3. If `"$REGISTERED"` starts with `"$WALLET_ADDRESS:"` → already resolved, silent skip
4. Otherwise → ask the user **after** showing the trade result:
   - If `$NICKNAME` is already set (from `.env`) use it directly, skip asking
   - Otherwise ask:
     > "One more thing: would you like a nickname for the activity rankings? Reply with your nickname, or reply 'skip' to opt out."
   - User **explicitly declines** ("skip" / "no" / "opt out" / sends an empty message):
     `echo "$WALLET_ADDRESS:skip" > ~/.aurehub/.registered` — do **not** call API; never ask again
   - User provides nickname:
     `echo "NICKNAME=<value>" >> ~/.aurehub/.env`, then:
     ```bash
     REGISTER_RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
       http://xaue.com/api/rankings/participants \
       -H 'Content-Type: application/json' \
       -d "{\"wallet_address\":\"$WALLET_ADDRESS\",\"nickname\":\"$NICKNAME\",\"source\":\"agent\"}")
     ```
     - HTTP 200 or 201: `echo "$WALLET_ADDRESS:$NICKNAME" > ~/.aurehub/.registered`; inform: "Registered with nickname: $NICKNAME"; never ask again
     - Any other status: silent continue, **do not** write marker file — will ask again after next trade

## Limit Buy Flow (USDT → XAUT via UniswapX)

Follow [references/limit-order-buy-place.md](references/limit-order-buy-place.md).

## Limit Sell Flow (XAUT → USDT via UniswapX)

Follow [references/limit-order-sell-place.md](references/limit-order-sell-place.md).

## Limit Order Query Flow

Follow [references/limit-order-status.md](references/limit-order-status.md).

## Limit Order Cancel Flow

Follow [references/limit-order-cancel.md](references/limit-order-cancel.md).

## Output Format

Output must include:

- `Stage`: `Preview` or `Ready to Execute`
- `Input`: token, amount, chain
- `Quote`: estimated XAUT amount, slippage setting, `minAmountOut`
- `Reference rate`: `1 XAUT ≈ X USDT` (for comparison with spot price; shown for both buy and sell)
- `Risk warnings`: large trade / slippage / gas
- `Command`: full `cast` command
- `Result`: tx hash, post-trade balance (after execution)

## Error Handling

- Missing prerequisite variable: prompt to add the variable to `.env` and stop
- RPC unavailable: prompt to switch RPC node and stop
- Insufficient balance: report minimum top-up amount and stop
- User has not confirmed: stay in Preview — do not execute
- Transaction failed: return failure reason and retry suggestions (reduce amount / increase slippage tolerance / check nonce and gas)

## XAUT Knowledge Base

- 1 XAUT = 1 troy ounce = 31.1035 grams
- Minimum precision: 0.000001 XAUT (on-chain minimum unit: 1, i.e. 10^-6)
- Conversion: X grams ÷ 31.1035 = XAUT amount
- Examples: 1g ≈ 0.032151 XAUT; 10g ≈ 0.32151 XAUT
- Contract address (Ethereum mainnet): 0x68749665FF8D2d112Fa859AA293F07a622782F38

Answer knowledge queries directly using the data above — no `cast` commands needed.

## First-Turn Contract (for testing)

1. When information is sufficient: give a structured preview first, then ask for execution confirmation.
2. When information is insufficient: clarify key details (token, amount, environment variables) — do not claim a trade has been executed.
