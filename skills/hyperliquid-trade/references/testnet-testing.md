# Testnet Testing Guide

Step-by-step guide for running integration tests on the Hyperliquid testnet. Covers known pitfalls to avoid repeating them.

## Pre-flight Checklist

Before running any script:

```bash
# 1. Check vault exists
ls ~/.aurehub/.wdk_vault ~/.aurehub/.wdk_password

# 2. Verify testnet config
cat ~/.aurehub/hyperliquid.yaml
# Must have: network: testnet, api_url: https://api.hyperliquid-testnet.xyz

# 3. Set high timeout (REQUIRED for testnet — spotMeta payload is large)
# Add to ~/.aurehub/hyperliquid.yaml:
#   request_timeout_ms: 120000
# Without this, --confirmed flows will time out mid-execution.

# 4. Check Node.js version
node --version   # must be >= 20.19.0

# 5. Verify node_modules
ls <scripts-dir>/node_modules/@nktkas
```

## Known Testnet Pitfalls

### 1. SDK timeout — the most common failure

**Symptom:** `{"error":"Unknown HTTP request error: TimeoutError: The operation was aborted due to timeout"}`

**Root cause:** `SymbolConverter.create()` fetches `meta` + `spotMeta` in parallel. On testnet, `spotMeta` returns a very large payload (all token metadata) and takes 20–50 s. The SDK default is 10 s; the code default is 60 s — both are too short for `--confirmed` flows that chain multiple API calls.

**Fix:** Add to `~/.aurehub/hyperliquid.yaml`:
```yaml
request_timeout_ms: 120000
```

Remove when done with testnet testing.

### 2. Spot and perp accounts are separate

Spot USDC and perp margin are in different sub-accounts. `balance.js spot` shows one balance, `balance.js perp` shows another.

**To fund the perp account for testing:**
```js
// Run from scripts/ directory
const {loadConfig} = await import('./lib/config.js');
const {createTransport, createExchangeClient} = await import('./lib/hl-client.js');
const {createSigner} = await import('./lib/signer.js');

const cfg = loadConfig();
const wallet = await createSigner(cfg, null);
const transport = createTransport(cfg);
const exchange = createExchangeClient(transport, wallet);

const result = await exchange.usdClassTransfer({ amount: '100', toPerp: true });
console.log(result); // { status: 'ok', ... }
```

Save as a one-off script or run with `node --input-type=module`.

### 3. Testnet spot markets have no readable names

Only `PURR/USDC` has a human-readable name. All other spot markets appear as `@1`, `@2`, etc.

**Use for tests:**
- Spot: `PURR` (coin arg), `PURR/USDC` (symbol in mids)
- Perp: `ETH`, `BTC`, `SOL` (all available on testnet)

### 4. Minimum order value: $10 USDC

The exchange rejects orders below $10 total value. Always size test orders accordingly.

**Example:** 2 PURR at $3 = $6 → rejected. Use 4 PURR at $3 = $12 → accepted.

Error message: `"Order must have minimum value of 10 USDC. asset=10000"`

### 5. Testnet API is slower and less reliable than mainnet

- Individual API calls: 1–10 s on testnet vs < 1 s on mainnet
- Parallel calls (SymbolConverter + allMids) can take 25–50 s total
- Occasional `500` responses; retry once before investigating

## Test Execution Order

Run in this order to build up state:

```bash
SCRIPTS=<scripts-dir>

# Step 1: Connectivity
node "$SCRIPTS/balance.js" address
node "$SCRIPTS/balance.js" spot
node "$SCRIPTS/balance.js" perp

# Step 2: Spot market orders
node "$SCRIPTS/trade.js" spot buy PURR 10                # preview
node "$SCRIPTS/trade.js" spot buy PURR 10 --confirmed    # execute
node "$SCRIPTS/trade.js" spot sell PURR 5                # preview
node "$SCRIPTS/trade.js" spot sell PURR 5 --confirmed    # execute

# Step 3: Error gates
node "$SCRIPTS/trade.js" spot buy FOOBAR 1 2>&1          # asset not found
node "$SCRIPTS/trade.js" spot sell PURR 9999 2>&1        # insufficient balance

# Step 4: Perp (requires perp account funded, see §2 above)
node "$SCRIPTS/trade.js" perp open ETH long 0.01 --leverage 5        # preview
node "$SCRIPTS/trade.js" perp open ETH long 0.01 --leverage 5 --confirmed
node "$SCRIPTS/balance.js" perp                                        # verify position
node "$SCRIPTS/trade.js" perp close ETH 0.01                           # preview
node "$SCRIPTS/trade.js" perp close ETH 0.01 --confirmed

# Step 5: Limit orders
node "$SCRIPTS/limit-order.js" place spot buy PURR 3.00 4            # preview
node "$SCRIPTS/limit-order.js" place spot buy PURR 3.00 4 --confirmed # execute → get oid
node "$SCRIPTS/limit-order.js" list
node "$SCRIPTS/limit-order.js" modify <oid> --price 2.80              # preview
node "$SCRIPTS/limit-order.js" modify <oid> --price 2.80 --confirmed  # execute → new oid
node "$SCRIPTS/limit-order.js" cancel <new-oid>
node "$SCRIPTS/limit-order.js" list                                    # verify empty
```

## Cleanup After Testing

```bash
# Remove high timeout from config
# Edit ~/.aurehub/hyperliquid.yaml — remove request_timeout_ms line

# Optional: transfer perp USDC back to spot
# exchange.usdClassTransfer({ amount: '100', toPerp: false })
```
