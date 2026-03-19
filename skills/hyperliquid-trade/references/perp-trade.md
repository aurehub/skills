# Perp Trade

## Open position

```bash
node "$SCRIPTS_DIR/trade.js" perp open <COIN> <long|short> <SIZE> [--leverage N] [--cross|--isolated]
```

- `--leverage N`: sets leverage before placing order via `updateLeverage()`; omit to use current account leverage (defaults to cross margin)
- `--cross` (default): cross margin — shared margin pool
- `--isolated`: isolated margin — fixed margin per position

The script calls `updateLeverage()` first (if `--leverage` is specified), then places the IOC order.

**Leverage warning:** If `leverage ≥ leverage_warn` (default 20x from `hyperliquid.yaml`), show an extra warning before confirmation.

## Close position

```bash
node "$SCRIPTS_DIR/trade.js" perp close <COIN> <SIZE>
```

Direction is **auto-detected**: the script calls `clearinghouseState()` and reads `szi` (signed position size):
- `szi > 0` (long) → places a sell order with `r: true` (reduce-only)
- `szi < 0` (short) → places a buy order with `r: true`

If no open position is found for the coin, the script exits with an error.

## Leverage limits

Each asset has a `maxLeverage` field in the perp metadata. If requested leverage exceeds this, `updateLeverage()` will fail. The error message will indicate the asset's maximum. Lever must also be between 1 and 100.

## Funding rates

Hyperliquid perps use a mark-price-based funding mechanism. Funding is charged/credited continuously. Long positions pay funding when the mark price is above the oracle; shorts receive it. Check current funding rates at app.hyperliquid.xyz.
