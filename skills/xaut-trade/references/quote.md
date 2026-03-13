# Quote & Slippage Protection

All commands below assume CWD is `$SCRIPTS_DIR` and env is sourced.

## 1. Fetch Quote

Example: buy with 100 USDT

```bash
source ~/.aurehub/.env
cd "$SCRIPTS_DIR"
RESULT=$(node swap.js quote --side buy --amount 100)
echo "$RESULT"
```

Output is JSON:

```json
{
  "side": "buy",
  "amountIn": "100",
  "amountOut": "0.033",
  "amountOutRaw": "33000",
  "sqrtPriceX96": "...",
  "gasEstimate": "150000"
}
```

For sell direction, use `--side sell --amount <XAUT_amount>`.

Extract values for downstream use:

```bash
AMOUNT_OUT=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['amountOut'])")
AMOUNT_OUT_RAW=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['amountOutRaw'])")
GAS_ESTIMATE=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['gasEstimate'])")
```

## 2. Calculate minAmountOut

Default slippage `default_slippage_bps` (e.g. 50 bps = 0.5%):

```bash
# Use python3 to avoid bash integer overflow on large trades
MIN_AMOUNT_OUT=$(python3 -c \
  "print(int($AMOUNT_OUT_RAW * (10000 - $DEFAULT_SLIPPAGE_BPS) // 10000))")
```

## 3. Preview Output

Must include at minimum:
- Input amount (human-readable)
- Estimated output received (`amountOut`)
- Slippage setting and `minAmountOut`
- Risk indicators (large trade / slippage / gas)

## 4. Execution Confirmation Gate

Determine confirmation level by USD notional and risk:

- `< risk.confirm_trade_usd`: show full preview, then execute without blocking confirmation
- `>= risk.confirm_trade_usd` and `< risk.large_trade_usd`: single confirmation
- `>= risk.large_trade_usd` or estimated slippage exceeds `risk.max_slippage_bps_warn`: double confirmation

Accepted confirmation phrases:
- "confirm approve"
- "confirm swap"
