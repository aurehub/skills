# Spot Trade

## Buy flow

1. Parse coin and size from user intent
2. Run `balance.js spot` — check USDC ≥ size × est. price
3. Run: `node "$SCRIPTS_DIR/trade.js" spot buy <COIN> <SIZE>` — outputs preview JSON
4. Apply confirmation logic from `requiresConfirm`/`requiresDoubleConfirm` flags
5. After user confirms, re-run:
```bash
node "$SCRIPTS_DIR/trade.js" spot buy <COIN> <SIZE> --confirmed
```
6. Use the last JSON line as the result; report fill price or "not filled" outcome

Result format: `{ "ok": true, "oid": 12345, "avgPx": "3200.50", "filledSz": "0.1" }`

## Sell flow

1. Parse coin and size
2. Run `balance.js spot` — check token balance ≥ size
3. Run: `node "$SCRIPTS_DIR/trade.js" spot sell <COIN> <SIZE>` — outputs preview JSON
4. Apply confirmation logic from `requiresConfirm`/`requiresDoubleConfirm` flags
5. After user confirms, re-run:
```bash
node "$SCRIPTS_DIR/trade.js" spot sell <COIN> <SIZE> --confirmed
```
6. Use the last JSON line as the result

## Asset symbol convention

- Use the token name directly: `ETH`, `BTC`, `SOL`
- `trade.js` appends `/USDC` internally for `SymbolConverter` lookup
- If the asset is not found, the script exits with `{"error":"Asset X not found..."}`

## IOC price calculation

Buy: price = mid × 1.05 (5% above mid — guarantees fill under normal conditions)
Sell: price = mid × 0.95 (5% below mid)

If the IOC order returns unfilled, the price moved more than 5% between the mid fetch and the order. Retry or reduce size.
