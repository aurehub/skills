# Limit Order Flow

This reference covers GTC limit orders: place, list, cancel, and modify.

## Confirmation Logic

After running `limit-order.js place ...` (without `--confirmed`), the script outputs a `preview` JSON object. Read it and:

- If `requiresDoubleConfirm: true` — ask the user to confirm **twice** before re-running with `--confirmed`
- If `requiresConfirm: true` — ask once
- If both are false — re-run with `--confirmed` immediately (no prompt needed)
- If `leverageWarning: true` — add an extra warning line about high leverage before prompting

Preview format:
```json
{
  "preview": true,
  "action": "Open Long ETH (Perpetual)",
  "coin": "ETH",
  "side": "long",
  "price": 3000,
  "size": 0.1,
  "leverage": 10,
  "marginMode": "Cross",
  "tradeValue": "300.00",
  "marginUsed": "30.00",
  "confirmThreshold": 100,
  "largeThreshold": 1000,
  "leverageWarn": 20,
  "requiresConfirm": false,
  "requiresDoubleConfirm": false,
  "leverageWarning": false
}
```

## Place a Limit Order

```bash
# Spot buy 0.1 ETH at $3000
node "$SCRIPTS_DIR/limit-order.js" place spot buy ETH 3000 0.1
# After user confirms:
node "$SCRIPTS_DIR/limit-order.js" place spot buy ETH 3000 0.1 --confirmed
```

Success output:
```json
{ "ok": true, "oid": 12345, "coin": "ETH", "side": "buy", "price": 3000, "size": 0.1, "status": "resting" }
```

`status` is `"resting"` (live on book) or `"filled"` (immediately matched).

## List Open Orders

```bash
node "$SCRIPTS_DIR/limit-order.js" list
node "$SCRIPTS_DIR/limit-order.js" list --coin ETH
```

Output:
```json
{ "orders": [{ "oid": 12345, "coin": "ETH", "side": "B", "limitPx": "3000", "sz": "0.1", "timestamp": 1700000000000 }] }
```

`side`: `"B"` = bid/buy, `"A"` = ask/sell.

Present as a table: Order ID | Coin | Side | Price | Size | Time.

## Cancel an Order

```bash
node "$SCRIPTS_DIR/limit-order.js" cancel 12345
```

Output: `{ "ok": true, "orderId": 12345 }`

## Modify an Order

The script always outputs a preview first. After user confirms, re-run with `--confirmed`:

```bash
# Step 1: get preview
node "$SCRIPTS_DIR/limit-order.js" modify 12345 --price 2900
# → { "preview": true, "orderId": 12345, "coin": "ETH", "side": "B", "oldPrice": 3000, "newPrice": 2900, "oldSize": 0.1, "newSize": 0.1 }
# Show user: "Changing order 12345: $3000 → $2900, size 0.1 (unchanged). Confirm? [y/N]"

# Step 2: after user confirms, re-run with --confirmed
node "$SCRIPTS_DIR/limit-order.js" modify 12345 --price 2900 --confirmed
# → { "preview": true, ... }   ← preview line (ignore)
# → { "ok": true, "oldOid": 12345, "oid": 67890, "newPrice": 2900, "newSize": 0.1 }
```

Use the **last** JSON line as the result. The `--confirmed` run re-emits the preview line first — ignore it.

**Note:** Hyperliquid implements modify as cancel + reorder internally. The order ID **changes**: `oldOid` is the cancelled order, `oid` is the new resting order. Update any stored order ID to `oid` before issuing further cancel or modify commands.

Modify always requires single confirmation — no size-based threshold.
